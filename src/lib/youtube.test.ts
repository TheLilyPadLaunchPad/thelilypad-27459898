import { describe, it, expect } from "vitest";
import { parseYouTubeVideoId } from "./youtube";

describe("parseYouTubeVideoId", () => {
  it("reads live links", () => expect(parseYouTubeVideoId("https://www.youtube.com/live/dQw4w9WgXcQ?si=x")).toBe("dQw4w9WgXcQ"));
  it("reads watch links", () => expect(parseYouTubeVideoId("youtube.com/watch?v=dQw4w9WgXcQ")).toBe("dQw4w9WgXcQ"));
  it("reads short links", () => expect(parseYouTubeVideoId("https://youtu.be/dQw4w9WgXcQ")).toBe("dQw4w9WgXcQ"));
  it("rejects other sites", () => expect(parseYouTubeVideoId("https://vimeo.com/dQw4w9WgXcQ")).toBeNull());
});
