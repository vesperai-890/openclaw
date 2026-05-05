import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  resolveOutboundDurableFinalDeliverySupport: vi.fn(),
  sendDurableMessageBatch: vi.fn(),
}));

vi.mock("../../infra/outbound/deliver.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../infra/outbound/deliver.js")>();
  return {
    ...actual,
    resolveOutboundDurableFinalDeliverySupport: mocks.resolveOutboundDurableFinalDeliverySupport,
  };
});

vi.mock("../message/send.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../message/send.js")>();
  return {
    ...actual,
    sendDurableMessageBatch: mocks.sendDurableMessageBatch,
  };
});

import {
  deliverInboundReplyWithMessageSendContext,
  resolveDurableInboundReplyToId,
} from "./durable-delivery.js";

describe("durable inbound reply delivery", () => {
  beforeEach(() => {
    mocks.resolveOutboundDurableFinalDeliverySupport.mockReset();
    mocks.sendDurableMessageBatch.mockReset();
    mocks.resolveOutboundDurableFinalDeliverySupport.mockResolvedValue({ ok: true });
    mocks.sendDurableMessageBatch.mockResolvedValue({
      status: "sent",
      receipt: {
        primaryPlatformMessageId: "m1",
        platformMessageIds: ["m1"],
        parts: [{ platformMessageId: "m1", kind: "text", index: 0 }],
        sentAt: 1,
      },
    });
  });

  it("preserves explicit null reply targets instead of falling back to context ids", () => {
    expect(
      resolveDurableInboundReplyToId({
        replyToId: null,
        payload: { text: "plain reply" },
        ctxPayload: {
          CommandAuthorized: true,
          ReplyToIdFull: "context-full-reply",
          ReplyToId: "context-reply",
        },
      }),
    ).toBeNull();
  });

  it("falls back to payload and context reply targets when no explicit null is provided", () => {
    expect(
      resolveDurableInboundReplyToId({
        payload: { text: "payload reply", replyToId: "payload-reply" },
        ctxPayload: {
          CommandAuthorized: true,
          ReplyToIdFull: "context-full-reply",
          ReplyToId: "context-reply",
        },
      }),
    ).toBe("payload-reply");

    expect(
      resolveDurableInboundReplyToId({
        payload: { text: "context reply" },
        ctxPayload: {
          CommandAuthorized: true,
          ReplyToIdFull: "context-full-reply",
          ReplyToId: "context-reply",
        },
      }),
    ).toBe("context-full-reply");
  });

  it("preserves explicit null thread targets instead of falling back to context thread", async () => {
    await deliverInboundReplyWithMessageSendContext({
      cfg: {},
      channel: "telegram",
      agentId: "main",
      info: { kind: "final" },
      payload: { text: "plain reply" },
      threadId: null,
      ctxPayload: {
        CommandAuthorized: true,
        OriginatingTo: "chat-1",
        MessageThreadId: "context-thread",
      },
    });

    expect(mocks.sendDurableMessageBatch).toHaveBeenCalledWith(
      expect.objectContaining({
        cfg: {},
        channel: "telegram",
        to: "chat-1",
        threadId: null,
      }),
    );
  });
});
