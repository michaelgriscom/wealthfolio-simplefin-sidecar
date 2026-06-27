/**
 * One-off helper: exchange a SimpleFIN setup token for a long-lived access URL.
 *
 *   tsx src/claim.ts <setup-token>
 *
 * Paste the printed access URL into config.json as `simplefinAccessUrl`. The
 * setup token is single-use and is consumed by this call.
 */
import { claimToken } from "./simplefin";

const token = process.argv[2];
if (!token) {
  console.error("Usage: tsx src/claim.ts <simplefin-setup-token>");
  process.exit(2);
}

claimToken(token)
  .then((accessUrl) => {
    console.log(accessUrl);
    process.exit(0);
  })
  .catch((e) => {
    console.error((e as Error).message);
    process.exit(1);
  });
