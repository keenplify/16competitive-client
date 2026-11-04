-- Pending release: apply only with the inspection renderer fix. Not applied to production.
-- Admins can subsequently edit these values in Skins > Preview rotation offset.
BEGIN;
-- Falchion Knife | Blood Moon
UPDATE skins SET preview_rotation = '[0,-90,0]'::jsonb WHERE id = '5644da23-8d0d-46cf-8e98-adcd38f6a392' AND view_model_path = 'models/16competitive/knife/ff7311eebfa996bf/v.mdl' AND preview_rotation = '[0,0,0]'::jsonb;
-- Falchion Knife | Volcanic Obsidian
UPDATE skins SET preview_rotation = '[0,-90,0]'::jsonb WHERE id = '9d824600-fdaa-413b-89db-43ee8bb3a4c5' AND view_model_path = 'models/16competitive/knife/7b113fb167b53c65/v.mdl' AND preview_rotation = '[0,0,0]'::jsonb;
-- Falchion Knife | Arctic Shard
UPDATE skins SET preview_rotation = '[0,-90,0]'::jsonb WHERE id = '582b4fa5-573d-4501-b510-eefecfbcd387' AND view_model_path = 'models/16competitive/knife/867291b6b41b9ed6/v.mdl' AND preview_rotation = '[0,0,0]'::jsonb;
-- Falchion Knife | Amethyst Veil
UPDATE skins SET preview_rotation = '[0,-90,0]'::jsonb WHERE id = 'b3b0e62e-83cb-4d7c-8778-290ea1605109' AND view_model_path = 'models/16competitive/knife/db1f8a4f14cb2c9a/v.mdl' AND preview_rotation = '[0,0,0]'::jsonb;
-- Falchion Knife | Emerald Haze
UPDATE skins SET preview_rotation = '[0,-90,0]'::jsonb WHERE id = 'b3bf9636-212e-4d50-b3ba-12a61d84e63c' AND view_model_path = 'models/16competitive/knife/538a67b495cc389b/v.mdl' AND preview_rotation = '[0,0,0]'::jsonb;
-- Butterfly Knife | Toxic Bloom
UPDATE skins SET preview_rotation = '[0,-90,0]'::jsonb WHERE id = '371e96ce-6f6a-4e42-9c67-96abf31cd518' AND view_model_path = 'models/16competitive/knife/e74b397f03bbbf95/v.mdl' AND preview_rotation = '[0,0,0]'::jsonb;
-- Butterfly Knife | Polar Fracture
UPDATE skins SET preview_rotation = '[0,-90,0]'::jsonb WHERE id = 'ecc6b7f0-8ef9-418e-b622-b80e10a340a8' AND view_model_path = 'models/16competitive/knife/5542661f99e3f565/v.mdl' AND preview_rotation = '[0,0,0]'::jsonb;
-- Butterfly Knife | Electric Reef
UPDATE skins SET preview_rotation = '[0,-90,0]'::jsonb WHERE id = 'e4d0b44f-b929-4815-9490-6217c280ca43' AND view_model_path = 'models/16competitive/knife/837c5c54ba3b2e9f/v.mdl' AND preview_rotation = '[0,0,0]'::jsonb;
-- Butterfly Knife | Sun Burst Alloy
UPDATE skins SET preview_rotation = '[0,-90,0]'::jsonb WHERE id = 'ef1541af-c97f-4fde-9ab3-bc0283da53e5' AND view_model_path = 'models/16competitive/knife/1073e148a2cfd810/v.mdl' AND preview_rotation = '[0,0,0]'::jsonb;
-- Butterfly Knife | Ember Mosaic
UPDATE skins SET preview_rotation = '[0,-90,0]'::jsonb WHERE id = '879f07a1-ab15-4aa5-a1fc-3469bc77e3a6' AND view_model_path = 'models/16competitive/knife/4df515fa1ae99a1d/v.mdl' AND preview_rotation = '[0,0,0]'::jsonb;
COMMIT;
