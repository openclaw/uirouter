import assert from "node:assert/strict";
import { createRouter, definePage } from "@openclaw/uirouter";

const inbox = definePage({
  id: "inbox",
  path: "/inbox",
  aliases: ["/mail"],
  component: () => "Inbox",
  loaderDeps: (_, location) => new URLSearchParams(location.search).get("folder") ?? "",
  loader: (user, { deps }) => [user, deps],
});
const router = createRouter({ routes: [inbox] });
const location = { pathname: "/mail", search: "?folder=archive", hash: "" };
await router.navigateLocation(location, "reader");

const state = router.getState();
const [match] = state.matches;
assert.equal(state.status, "success");
assert.deepEqual(state.resolvedLocation, location);
assert.equal(match.routeId, "inbox");
assert.equal(match.module, "Inbox");
assert.deepEqual(match.data, ["reader", "archive"]);
router.stop();
