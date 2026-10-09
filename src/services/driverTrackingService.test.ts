import { describe, expect, it, vi } from "vitest";
import { requestInitialLocation } from "./driverTrackingService";

function position(timestamp = 1_000) {
  return {
    coords: {
      latitude: 39.9718,
      longitude: -86.1283,
      accuracy: 12,
      altitude: null,
      altitudeAccuracy: null,
      heading: null,
      speed: null,
    },
    timestamp,
  } as GeolocationPosition;
}

function locationError(code: number, message: string) {
  return {
    code,
    message,
    PERMISSION_DENIED: 1,
    POSITION_UNAVAILABLE: 2,
    TIMEOUT: 3,
  } as GeolocationPositionError;
}

describe("initial driver location", () => {
  it("uses the first high-accuracy fix when available", async () => {
    const getCurrentPosition = vi.fn(
      (
        success: PositionCallback,
        _failure?: PositionErrorCallback | null,
        _options?: PositionOptions,
      ) => success(position()),
    );
    const result = await requestInitialLocation({
      getCurrentPosition,
    } as unknown as Geolocation);

    expect(result.accuracyMeters).toBe(12);
    expect(getCurrentPosition).toHaveBeenCalledTimes(1);
    expect(getCurrentPosition.mock.calls[0]?.[2]).toMatchObject({
      enableHighAccuracy: true,
      maximumAge: 0,
    });
  });

  it("retries with a cached balanced fix after a timeout", async () => {
    const getCurrentPosition = vi
      .fn()
      .mockImplementationOnce(
        (_success: PositionCallback, failure: PositionErrorCallback) =>
          failure(locationError(3, "Timed out")),
      )
      .mockImplementationOnce((success: PositionCallback) =>
        success(position(2_000)),
      );

    const result = await requestInitialLocation({
      getCurrentPosition,
    } as unknown as Geolocation);

    expect(result.capturedAt).toBe(2_000);
    expect(getCurrentPosition).toHaveBeenCalledTimes(2);
    expect(getCurrentPosition.mock.calls[1]?.[2]).toMatchObject({
      enableHighAccuracy: false,
      maximumAge: 120_000,
    });
  });

  it("does not retry when browser location permission is denied", async () => {
    const getCurrentPosition = vi.fn(
      (_success: PositionCallback, failure: PositionErrorCallback) =>
        failure(locationError(1, "Denied")),
    );

    await expect(
      requestInitialLocation({
        getCurrentPosition,
      } as unknown as Geolocation),
    ).rejects.toThrow("Permission denied by the browser");
    expect(getCurrentPosition).toHaveBeenCalledTimes(1);
  });
});
