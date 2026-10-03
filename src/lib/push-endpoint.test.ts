import { describe, expect, it } from "vitest";
import { endpointPushAutorise } from "./push-endpoint";

describe("endpointPushAutorise", () => {
  it("accepte les services push des navigateurs", () => {
    for (const endpoint of [
      "https://fcm.googleapis.com/fcm/send/abc:def",
      "https://updates.push.services.mozilla.com/wpush/v2/gAAAA",
      "https://wns2-par02p.notify.windows.com/w/?token=x",
      "https://web.push.apple.com/QGx",
    ]) expect(endpointPushAutorise(endpoint)).toBe(true);
  });

  it("refuse tout autre hôte, schéma, port ou identifiant (SSRF)", () => {
    for (const endpoint of [
      "http://fcm.googleapis.com/fcm/send/abc",
      "https://169.254.169.254/latest/meta-data",
      "https://localhost/x",
      "https://fcm.googleapis.com.evil.example/x",
      "https://evilpush.services.mozilla.com.example/x",
      "https://fcm.googleapis.com:8443/x",
      "https://user:pass@fcm.googleapis.com/x",
      "pas une url",
      42,
    ]) expect(endpointPushAutorise(endpoint)).toBe(false);
  });
});
