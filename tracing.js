'use strict';

// IMPORTANT: preload this file before index.js so HTTP, Express, and MongoDB
// instrumentations can patch modules before the application imports them.
const { NodeSDK } = require('@opentelemetry/sdk-node');
const { ConsoleSpanExporter } = require('@opentelemetry/sdk-trace');
const { OTLPTraceExporter } = require('@opentelemetry/exporter-trace-otlp-http');
const { HttpInstrumentation } = require('@opentelemetry/instrumentation-http');
const { ExpressInstrumentation } = require('@opentelemetry/instrumentation-express');
const { MongoDBInstrumentation } = require('@opentelemetry/instrumentation-mongodb');
const { PeriodicExportingMetricReader, ConsoleMetricExporter } = require('@opentelemetry/sdk-metrics');

const exportMode = process.env.TRACE_EXPORT_MODE || 'console';
if (!['console', 'otlp'].includes(exportMode)) {
  throw new Error('TRACE_EXPORT_MODE must be "console" or "otlp"');
}

const traceExporter = exportMode === 'otlp'
  ? new OTLPTraceExporter({
      // Jaeger 2.x OTLP/HTTP ingest port. /v1/traces is required for this exporter.
      url: process.env.OTEL_EXPORTER_OTLP_TRACES_ENDPOINT || 'http://localhost:4318/v1/traces',
    })
  : new ConsoleSpanExporter();

const sdk = new NodeSDK({
  serviceName: 'todo-service',
  traceExporter,
  // Jaeger is a trace backend. Metrics stay visible in the Node terminal.
  metricReaders: [new PeriodicExportingMetricReader({
    exporter: new ConsoleMetricExporter(),
    exportIntervalMillis: 5000,
  })],
  instrumentations: [
    new HttpInstrumentation(),
    new ExpressInstrumentation(),
    new MongoDBInstrumentation(),
  ],
});

sdk.start();
console.log(`[OpenTelemetry] service=todo-service exporter=${exportMode}`);

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.once(signal, () => {
    sdk.shutdown()
      .catch((error) => console.error('[OpenTelemetry] shutdown error:', error))
      .finally(() => process.exit(0));
  });
}
