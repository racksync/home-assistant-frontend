import { assert, describe, it } from "vitest";
import { createHassioSession } from "../../src/data/hassio/ingress";

describe("Create hassio session", () => {
  const hass = {
    config: { version: "1.0.0" },
    callApi: async () => ({
      data: { session: "fhdsu73rh3io4h8f3irhjel8ousafehf8f3yh" },
    }),
  };

  it("Test create session without HTTPS", async () => {
    // @ts-ignore
    global.document = {};
    // @ts-ignore
    global.location = {};
    // @ts-ignore
    await createHassioSession(hass);
    assert.strictEqual(
      // @ts-ignore
      global.document.cookie,
      "ingress_session=fhdsu73rh3io4h8f3irhjel8ousafehf8f3yh;path=/api/hassio_ingress/;SameSite=Strict"
    );
  });
  it("Test create session with HTTPS", async () => {
    // @ts-ignore
    global.document = {};
    // @ts-ignore
    global.location = { protocol: "https:" };
    // @ts-ignore
    await createHassioSession(hass);
    assert.strictEqual(
      // @ts-ignore
      global.document.cookie,
      "ingress_session=fhdsu73rh3io4h8f3irhjel8ousafehf8f3yh;path=/api/hassio_ingress/;SameSite=Strict;Secure"
    );

    // Clean up in case they will be used in other tests
    // @ts-ignore
    global.document = {};
    // @ts-ignore
    global.location = {};
  });
  it("Test fail to create", async () => {
    const createSessionPromise = createHassioSession({
      // @ts-ignore
      callApi: async () => {
        // noop
      },
    }).then(
      () => true,
      () => false
    );
    assert.strictEqual(await createSessionPromise, false);
  });
});
