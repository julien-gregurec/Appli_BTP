import { describe, expect, it } from "vitest";
import {
  IDLE_GESTURE_ROUTING,
  routePointerDown,
  routePointerMove,
  routePointerUp,
} from "./gesture-routing";

const yes = () => true;
const no = () => false;

describe("arbitrage plan / poignée (§4)", () => {
  it("laisse le plan prendre le contact quand aucune poignée n'est visée", () => {
    const step = routePointerDown(IDLE_GESTURE_ROUTING, 1, no);
    expect(step.route).toBe("viewport");
    expect(step.state.grabbedPointerId).toBeNull();
    expect(routePointerMove(step.state, 1)).toBe("viewport");
  });

  it("capte le contact pour la poignée et le retire au plan", () => {
    const step = routePointerDown(IDLE_GESTURE_ROUTING, 7, yes);
    expect(step.route).toBe("handle");
    expect(step.state.grabbedPointerId).toBe(7);
    expect(routePointerMove(step.state, 7)).toBe("handle");
  });

  /** L'exigence centrale : un pan ne devient jamais une édition, ni l'inverse. */
  it("n'interroge plus la poignée une fois le contact attribué au plan", () => {
    let asked = 0;
    const down = routePointerDown(IDLE_GESTURE_ROUTING, 1, () => {
      asked += 1;
      return false;
    });
    expect(asked).toBe(1);
    // Les mouvements suivants ne repassent pas par l'arbitrage : le plan garde la main.
    expect(routePointerMove(down.state, 1)).toBe("viewport");
    expect(routePointerMove(down.state, 1)).toBe("viewport");
    expect(asked).toBe(1);
  });

  it("ignore un second doigt pendant qu'une poignée est tenue", () => {
    const held = routePointerDown(IDLE_GESTURE_ROUTING, 1, yes).state;
    let asked = 0;
    const second = routePointerDown(held, 2, () => {
      asked += 1;
      return true;
    });
    expect(second.route).toBe("ignored");
    // La poignée n'est même pas interrogée : le geste en cours reste maître.
    expect(asked).toBe(0);
    expect(second.state.grabbedPointerId).toBe(1);
    expect(routePointerMove(second.state, 2)).toBe("ignored");
    expect(routePointerUp(second.state, 2).route).toBe("ignored");
    // Et le contact surnuméraire ne libère pas la poignée.
    expect(routePointerUp(second.state, 2).state.grabbedPointerId).toBe(1);
  });

  it("libère la poignée à son relâchement et rend la main au plan", () => {
    const held = routePointerDown(IDLE_GESTURE_ROUTING, 3, yes).state;
    const released = routePointerUp(held, 3);
    expect(released.route).toBe("handle");
    expect(released.state.grabbedPointerId).toBeNull();
    expect(routePointerDown(released.state, 4, no).route).toBe("viewport");
  });

  it("route un relâchement ordinaire vers le plan", () => {
    expect(routePointerUp(IDLE_GESTURE_ROUTING, 1).route).toBe("viewport");
  });

  it("ne mute jamais l'état reçu", () => {
    const state = { ...IDLE_GESTURE_ROUTING };
    routePointerDown(state, 1, yes);
    expect(state.grabbedPointerId).toBeNull();
  });
});
