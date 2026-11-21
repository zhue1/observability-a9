'use strict';

const express = require('express');
const { MongoClient } = require('mongodb');
const { performance } = require('node:perf_hooks');
const { trace, context, metrics, SpanStatusCode } = require('@opentelemetry/api');

const PORT = Number(process.env.PORT || 3000);
const MONGO_URL = process.env.MONGO_URL || 'mongodb://localhost:27017';
const client = new MongoClient(MONGO_URL, { serverSelectionTimeoutMS: 7000 });
const tracer = trace.getTracer('todo-service-routes');
const meter = metrics.getMeter('todo-service-metrics');
const requestCounter = meter.createCounter('todo.http.requests', {
  description: 'Number of completed HTTP requests',
  unit: '{request}',
});
const requestDuration = meter.createHistogram('todo.http.server.duration', {
  description: 'Duration of completed HTTP requests',
  unit: 'ms',
});

function writeLog(level, event, values = {}) {
  const active = trace.getSpan(context.active());
  const sc = active && active.spanContext();
  console.log(JSON.stringify({
    timestamp: new Date().toISOString(),
    level,
    service: 'todo-service',
    event,
    ...(sc && sc.traceId ? { trace_id: sc.traceId, span_id: sc.spanId } : {}),
    ...values,
  }));
}

async function startServer() {
  await client.connect();
  const database = client.db('observability_a9');
  const todos = database.collection('todos');

  // The demo starts with real queryable MongoDB data. Re-running is safe.
  if (await todos.countDocuments({}) === 0) {
    await todos.insertMany([
      { id: 1, task: 'Read the OpenTelemetry docs', completed: true },
      { id: 2, task: 'Inspect traces in Jaeger', completed: false },
      { id: 3, task: 'Summarize metrics and logs', completed: false },
    ]);
  }

  const app = express();
  app.use(express.json());

  // An HTTP metric and a structured log event for every request.
  app.use((req, res, next) => {
    const start = performance.now();
    const inboundSpan = trace.getSpan(context.active());
    const traceId = inboundSpan ? inboundSpan.spanContext().traceId : undefined;
    res.once('finish', () => {
      const ms = Math.round((performance.now() - start) * 100) / 100;
      const attributes = {
        'http.request.method': req.method,
        'http.route': req.route?.path || req.path,
        'http.response.status_code': res.statusCode,
      };
      requestCounter.add(1, attributes);
      requestDuration.record(ms, attributes);
      writeLog('info', 'http_request', {
        method: req.method,
        path: req.originalUrl,
        status_code: res.statusCode,
        duration_ms: ms,
        ...(traceId ? { trace_id: traceId } : {}),
      });
    });
    next();
  });

  app.get('/health', async (_req, res, next) => {
    try {
      await database.command({ ping: 1 });
      res.json({ status: 'ok' });
    } catch (error) { next(error); }
  });

  app.get('/todo', (_req, res, next) => {
    tracer.startActiveSpan('todo.list', async (span) => {
      try {
        const rows = await todos.find({}, { projection: { _id: 0 } }).sort({ id: 1 }).toArray();
        span.setAttribute('todo.count', rows.length);
        writeLog('info', 'todos_listed', { count: rows.length });
        res.json(rows);
      } catch (error) {
        span.recordException(error);
        span.setStatus({ code: SpanStatusCode.ERROR, message: error.message });
        next(error);
      } finally {
        span.end();
      }
    });
  });

  app.get('/todo/:id', (req, res, next) => {
    tracer.startActiveSpan('todo.get', async (span) => {
      try {
        const id = Number(req.params.id);
        if (!Number.isSafeInteger(id) || id < 1) {
          res.status(400).json({ error: 'id must be a positive integer' });
          return;
        }
        span.setAttribute('todo.id', id);
        const row = await todos.findOne({ id }, { projection: { _id: 0 } });
        if (!row) {
          res.status(404).json({ error: `No todo with id=${id}` });
          return;
        }
        res.json(row);
      } catch (error) {
        span.recordException(error);
        span.setStatus({ code: SpanStatusCode.ERROR, message: error.message });
        next(error);
      } finally {
        span.end();
      }
    });
  });

  app.post('/todo', (req, res, next) => {
    tracer.startActiveSpan('todo.create', async (span) => {
      try {
        if (typeof req.body.task !== 'string' || !req.body.task.trim()) {
          res.status(400).json({ error: 'task is required' });
          return;
        }
        // This teaching exercise uses short sequential integer IDs.
        const newest = await todos.find().sort({ id: -1 }).limit(1).next();
        const nextId = newest ? newest.id + 1 : 1;
        const row = { id: nextId, task: req.body.task.trim(), completed: false };
        await todos.insertOne(row);
        span.setAttribute('todo.id', nextId);
        writeLog('info', 'todo_created', { id: nextId });
        res.status(201).json(row);
      } catch (error) {
        span.recordException(error);
        span.setStatus({ code: SpanStatusCode.ERROR, message: error.message });
        next(error);
      } finally {
        span.end();
      }
    });
  });

  // Exercise an intentional error path for Jaeger status comparison.
  app.get('/error-demo', (_req, _res, next) => {
    tracer.startActiveSpan('todo.example_failure', (span) => {
      const error = new Error('Intentional observability demo failure');
      span.recordException(error);
      span.setStatus({ code: SpanStatusCode.ERROR, message: error.message });
      writeLog('error', 'demo_failure', { message: error.message });
      span.end();
      next(error);
    });
  });

  app.use((error, req, res, _next) => {
    writeLog('error', 'unhandled_request_error', {
      method: req.method,
      path: req.originalUrl,
      message: error.message,
    });
    res.status(500).json({ error: 'Internal server error' });
  });

  app.listen(PORT, () => {
    writeLog('info', 'server_started', { url: `http://localhost:${PORT}`, mongo: 'connected' });
  });
}

startServer().catch(async (error) => {
  writeLog('error', 'startup_failed', { message: error.message });
  await client.close().catch(() => {});
  process.exit(1);
});
