const { trace, SpanStatusCode } = require("@opentelemetry/api");
const express = require("express");
const { rollTheDice } = require("./dice.js");
const { Logger } = require("./logger.js");

const tracer = trace.getTracer("dice-server", "0.1.0");

const logger = new Logger("dice-server");

const PORT = parseInt(process.env.PORT || "8084", 10);
// Lab addition: dice-server now saves every roll to a downstream service
// instead of just returning it. This gives the knowledge graph and the
// trace view a real dependency to reason about — see lab/SUBMISSION.md.
const ROLLS_STORE_URL =
  process.env.ROLLS_STORE_URL || "http://rolls-store:8085";

const app = express();

// Save the roll result to rolls-store. Throws if the call fails or the
// response is not OK, so the caller can turn that into a 500.
async function saveRoll(result) {
  const res = await fetch(`${ROLLS_STORE_URL}/rolls`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ rolls: result }),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`rolls-store responded ${res.status}: ${body}`);
  }
}

app.get("/rolldice", (req, res) => {
  return tracer.startActiveSpan("rollDice", (span) => {
    logger.log("Received request to roll dice");
    const rolls = req.query.rolls
      ? parseInt(req.query.rolls.toString(), 10)
      : NaN;
    if (Number.isNaN(rolls)) {
      const errorMessage =
        "Request parameter 'rolls' is missing or not a number.";
      span.setStatus({
        code: SpanStatusCode.ERROR,
        message: errorMessage,
      });
      logger.error(errorMessage);
      res.status(400).send(errorMessage);
      span.end();
      return;
    }

    const result = rollTheDice(rolls, 1, 6);

    saveRoll(result)
      .then(() => {
        res.send(JSON.stringify(result));
        span.end();
      })
      .catch((err) => {
        const errorMessage = `Failed to save roll to rolls-store: ${err.message}`;
        span.setStatus({
          code: SpanStatusCode.ERROR,
          message: errorMessage,
        });
        logger.error(errorMessage);
        res.status(500).send(errorMessage);
        span.end();
      });
  });
});

app.listen(PORT, () => {
  console.log(`Listening for requests on http://127.0.0.1:${PORT}`);
});
