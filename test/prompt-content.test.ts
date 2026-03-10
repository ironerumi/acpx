import assert from "node:assert/strict";
import test from "node:test";
import {
  parsePromptSource,
  PromptInputValidationError,
  textPrompt,
} from "../src/prompt-content.js";

test("parsePromptSource accepts valid image blocks", () => {
  const prompt = parsePromptSource(
    JSON.stringify([{ type: "image", mimeType: "image/png", data: "aW1hZ2U=" }]),
  );

  assert.deepEqual(prompt, [{ type: "image", mimeType: "image/png", data: "aW1hZ2U=" }]);
});

test("parsePromptSource rejects image blocks with non-image mime types", () => {
  assert.throws(
    () =>
      parsePromptSource(
        JSON.stringify([{ type: "image", mimeType: "application/json", data: "aW1hZ2U=" }]),
      ),
    (error: unknown) =>
      error instanceof PromptInputValidationError &&
      /image block mimeType must start with image\//.test(error.message),
  );
});

test("parsePromptSource rejects image blocks with invalid base64 payloads", () => {
  assert.throws(
    () =>
      parsePromptSource(JSON.stringify([{ type: "image", mimeType: "image/png", data: "%%%" }])),
    (error: unknown) =>
      error instanceof PromptInputValidationError &&
      /image block data must be valid base64/.test(error.message),
  );
});

test("parsePromptSource keeps non-JSON bracket text as plain text", () => {
  assert.deepEqual(
    parsePromptSource("[todo] validate image input"),
    textPrompt("[todo] validate image input"),
  );
});
