# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users
Counter-Strike 1.6 players using the Electron launcher on Linux and Windows.

## Product Purpose
Competitive matchmaking, profile history, loadouts and owned cosmetics, with authoritative ownership and purchases in the backend.

## Capabilities and Constraints
Profile contains Summary, Loadout, Inventory, Operation and Match History. Inventory holds unused stickers and future consumables only. Loadout lists stock weapons and owned skins, with right-click Preview offering v_ inspection and first-person views. Weapon thumbnails use the same inspection presentation and a versioned cache; older p_ previews are invalidated automatically. Saved stickers appear on their matching weapon variant in the v_ preview; p_ stickers are not supported yet. Admins configure sticker artwork and Points/P Cash prices. Applying a sticker consumes one owned sticker after preview and confirmation. First implementation targets viewmodels. Ordinary clients retain normal models; compatible helpers may render stickers. Weapon-instance appearance must survive match drops and pickups without transferring account ownership. MMR consumable behavior remains future work.

## Brand Commitments
Preserve the existing launcher interface, square corners and eight supported languages. The supplied CS2 screenshot guides the simplified editor: large weapon preview, compact placement controls and an explicit Apply action.
