/**
 * Local copy of the Wealthfolio snapshot holding shape.
 *
 * The sidecar talks to Wealthfolio over its REST API and has no dependency on
 * the addon SDK, so the one type we need from it is inlined here.
 */
export interface SnapshotHoldingInput {
  assetId?: string;
  symbol: string;
  quantity: string;
  currency: string;
  averageCost?: string;
  exchangeMic?: string;
  quoteCcy?: string;
  instrumentType?: string;
}
