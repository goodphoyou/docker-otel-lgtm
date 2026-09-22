const { trace, SpanStatusCode } = require("@opentelemetry/api");
const express = require("express");
const { Logger } = require("./logger.js");

const tracer = trace.getTracer("rolls-store", "0.1.0");
const logger = new Logger("rolls-store");

const PORT = parseInt(process.env.PORT || "8085", 10);
const app = express();
app.use(express.json());

// In-memory store — this is a lab demo service, not a real database.
const rolls = [];

// Fault toggle for the demo. Off by default: normal, fast, always succeeds.
// Turned on via POST /fault, off via DELETE /fault — see lab/README or
// lab/k8s/fault-on.sh / fault-off.sh.
const fault = { enabled: false };

const FAULT_LATENCY_MS = 2000;
const FAULT_ERROR_RATE = 0.3;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

app.post("/rolls", (req, res) => {
  return tracer.startActiveSpan("saveRoll", async (span) => {
    span.setAttribute("rollsstore.fault_enabled", fault.enabled);

    if (fault.enabled) {
      await sleep(FAULT_LATENCY_MS);
      if (Math.random() < FAULT_ERROR_RATE) {
        const errorMessage =
          "connection pool exhausted under load — failed to persist roll";
        span.setStatus({ code: SpanStatusCode.ERROR, message: errorMessage });
        logger.error(errorMessage);
        res.status(500).send(errorMessage);
        span.end();
        return;
      }
    }

    rolls.push({ value: req.body?.rolls, at: new Date().toISOString() });
    logger.log(`Stored roll (total stored: ${rolls.length})`);
    res.status(201).send({ stored: true, count: rolls.length });
    span.end();
  });
});

app.get("/fault", (req, res) => {
  res.send(fault);
});

app.post("/fault", (req, res) => {
  fault.enabled = true;
  logger.warn("Fault injection ENABLED — /rolls will now be slow and fail intermittently");
  res.send(fault);
});

app.delete("/fault", (req, res) => {
  fault.enabled = false;
  logger.log("Fault injection disabled — /rolls back to normal");
  res.send(fault);
});

app.listen(PORT, () => {
  console.log(`Listening for requests on http://127.0.0.1:${PORT}`);
});
