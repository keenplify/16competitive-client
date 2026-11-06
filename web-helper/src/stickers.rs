//! Trusted, embedded geometry code; all IO and hash checks remain in Rust.
use rquickjs::{Array, ArrayBuffer, Context, Function, Object, Runtime};
use serde::Deserialize;
use sha2::{Digest, Sha256};
use std::{
    fs,
    io::{Read, Write},
    path::Path,
    time::{Duration, Instant},
};

const SCRIPT: &str = include_str!("../assets/sticker-baker.js");
const MODEL_LIMIT: usize = 16 * 1024 * 1024;
const TEXTURE_LIMIT: usize = 512 * 1024 * 1024 + 12 + 32 * 12;
fn hash(bytes: &[u8]) -> String {
    format!("{:x}", Sha256::digest(bytes))
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct Recipe {
    id: String,
    source_path: String,
    source_sha256: String,
    canonical: String,
    stickers: Vec<Artwork>,
}
#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct Artwork {
    image_path: String,
}
struct Pixels {
    width: u32,
    height: u32,
    rgba: Vec<u8>,
}

fn engine(deadline: Instant) -> Result<(Runtime, Context), String> {
    let runtime = Runtime::new().map_err(|_| "Sticker engine unavailable")?;
    runtime.set_memory_limit(1536 * 1024 * 1024);
    runtime.set_max_stack_size(1024 * 1024);
    runtime.set_interrupt_handler(Some(Box::new(move || Instant::now() >= deadline)));
    let context = Context::full(&runtime).map_err(|_| "Sticker engine unavailable")?;
    context
        .with(|ctx| -> rquickjs::Result<()> {
            ctx.globals().set(
                "nativeDecodeUtf8",
                Function::new(ctx.clone(), |bytes: ArrayBuffer<'_>| {
                    // Only synchronous decoding; no JS callbacks or buffer mutation.
                    unsafe { bytes.as_bytes() }
                        .map(|bytes| String::from_utf8_lossy(bytes).into_owned())
                        .unwrap_or_default()
                })?,
            )?;
            ctx.eval::<(), _>(SCRIPT)
        })
        .map_err(|_| "Sticker engine unavailable")?;
    Ok((runtime, context))
}

fn recipes(bytes: &[u8]) -> Result<Vec<Recipe>, String> {
    let text = std::str::from_utf8(bytes).map_err(|_| "Invalid sticker recipes")?;
    let (_runtime, context) = engine(Instant::now() + Duration::from_secs(90))?;
    let normalized: String = context
        .with(|ctx| -> rquickjs::Result<String> {
            let baker: Object = ctx.globals().get("StickerBaker")?;
            let parse: Function = baker.get("recipes")?;
            parse.call((text,))
        })
        .map_err(|_| "Invalid sticker recipes")?;
    let recipes: Vec<Recipe> =
        serde_json::from_str(&normalized).map_err(|_| "Invalid sticker recipes")?;
    if recipes
        .iter()
        .any(|recipe| hash(recipe.canonical.as_bytes())[..32] != recipe.id)
    {
        return Err("Sticker recipe hash mismatch".into());
    }
    Ok(recipes)
}

fn pixels(bytes: &[u8]) -> Result<Pixels, String> {
    let mut decoder = png::Decoder::new(bytes);
    decoder.set_limits(png::Limits {
        bytes: 4 * 1024 * 1024,
    });
    decoder.set_transformations(png::Transformations::EXPAND | png::Transformations::STRIP_16);
    let mut reader = decoder.read_info().map_err(|_| "Invalid sticker PNG")?;
    let info = reader.info();
    if info.width == 0 || info.height == 0 || info.width > 512 || info.height > 512 {
        return Err("Invalid sticker dimensions".into());
    }
    let mut buffer = vec![0; reader.output_buffer_size()];
    let frame = reader
        .next_frame(&mut buffer)
        .map_err(|_| "Invalid sticker PNG")?;
    let mut rgba = Vec::with_capacity(frame.width as usize * frame.height as usize * 4);
    use png::ColorType::*;
    for pixel in buffer[..frame.buffer_size()].chunks_exact(frame.color_type.samples()) {
        match frame.color_type {
            Rgba => rgba.extend_from_slice(pixel),
            Rgb => rgba.extend_from_slice(&[pixel[0], pixel[1], pixel[2], 255]),
            Grayscale => rgba.extend_from_slice(&[pixel[0], pixel[0], pixel[0], 255]),
            GrayscaleAlpha => rgba.extend_from_slice(&[pixel[0], pixel[0], pixel[0], pixel[1]]),
            Indexed => return Err("Invalid sticker PNG".into()),
        }
    }
    Ok(Pixels {
        width: frame.width,
        height: frame.height,
        rgba,
    })
}

fn bake(
    recipe: &Recipe,
    source: Vec<u8>,
    images: Vec<Pixels>,
) -> Result<(Vec<u8>, Vec<u8>), String> {
    let deadline = Instant::now() + Duration::from_secs(90);
    let (_runtime, context) = engine(deadline)?;
    context
        .with(|ctx| -> rquickjs::Result<_> {
            let baker: Object = ctx.globals().get("StickerBaker")?;
            let bake: Function = baker.get("bake")?;
            let mut value: serde_json::Value = serde_json::from_str(&recipe.canonical).unwrap();
            value["id"] = recipe.id.clone().into();
            let array = Array::new(ctx.clone())?;
            for (i, image) in images.into_iter().enumerate() {
                let object = Object::new(ctx.clone())?;
                object.set("width", image.width)?;
                object.set("height", image.height)?;
                object.set("rgba", ArrayBuffer::new(ctx.clone(), image.rgba)?)?;
                array.set(i, object)?;
            }
            let result: Object = bake
                .call((
                    value.to_string(),
                    ArrayBuffer::new(ctx.clone(), source)?,
                    array,
                ))
                .map_err(|error| {
                    #[cfg(test)]
                    eprintln!("Embedded sticker exception: {:?}", ctx.catch());
                    error
                })?;
            let model: ArrayBuffer = result.get("model")?;
            let textures: ArrayBuffer = result.get("textures")?;
            // No JS executes while these views are copied, and no shared buffers are exposed.
            let model = unsafe { model.as_bytes() }.ok_or(rquickjs::Error::Unknown)?;
            let textures = unsafe { textures.as_bytes() }.ok_or(rquickjs::Error::Unknown)?;
            if model.len() > MODEL_LIMIT || textures.len() > TEXTURE_LIMIT {
                return Err(rquickjs::Error::Unknown);
            }
            Ok((model.to_vec(), textures.to_vec()))
        })
        .map_err(|_| {
            if Instant::now() >= deadline {
                "STICKER_BAKE_TIMEOUT".into()
            } else {
                "STICKER_BAKE_FAILED".into()
            }
        })
}

fn read(path: &Path, limit: usize) -> Result<Vec<u8>, String> {
    let meta = fs::symlink_metadata(path).map_err(|_| "Sticker file unavailable")?;
    if !meta.is_file() || meta.file_type().is_symlink() || meta.len() > limit as u64 {
        return Err("Invalid sticker file".into());
    }
    let mut options = fs::OpenOptions::new();
    options.read(true);
    #[cfg(unix)]
    {
        use std::os::unix::fs::OpenOptionsExt;
        options.custom_flags(libc::O_NOFOLLOW);
    }
    let mut bytes = Vec::new();
    options
        .open(path)
        .map_err(|_| "Sticker file unavailable")?
        .take(limit as u64 + 1)
        .read_to_end(&mut bytes)
        .map_err(|_| "Sticker read failed")?;
    if bytes.len() > limit {
        return Err("Sticker file exceeds limit".into());
    }
    Ok(bytes)
}

fn immutable(root: &Path, bytes: &[u8], extension: &str) -> Result<String, String> {
    let digest = hash(bytes);
    let path = crate::assets::game_destination(
        root,
        &format!("models/16competitive/st/{}.{}", &digest[..32], extension),
    )?;
    // Reconnects reuse immutable verified bytes. Some Wine/filesystem pairs
    // report access denied (not AlreadyExists) for hard-linking over a cache hit.
    if path.exists() {
        if read(&path,TEXTURE_LIMIT).is_ok_and(|bytes| hash(&bytes)==digest) { return Ok(digest); }
        // This content-addressed launcher cache is corrupt; leave the original game files alone.
        fs::remove_file(&path).map_err(|_|"Sticker cache repair failed")?;
    }
    let temporary = path.with_file_name(format!(".{}.tmp", uuid::Uuid::new_v4()));
    let result = (|| {
        let mut options = fs::OpenOptions::new();
        options.write(true).create_new(true);
        #[cfg(unix)]
        {
            use std::os::unix::fs::OpenOptionsExt;
            options.mode(0o600);
        }
        let mut file = options
            .open(&temporary)
            .map_err(|_| "Sticker cache unavailable")?;
        file.write_all(bytes)
            .map_err(|_| "Sticker cache write failed")?;
        file.sync_all().map_err(|_| "Sticker cache write failed")?;
        match fs::hard_link(&temporary, &path) {
            Ok(()) => {}
            Err(error) if error.kind() == std::io::ErrorKind::AlreadyExists => {}
            Err(_) => return Err("Sticker cache publish failed".into()),
        }
        if hash(&read(&path, TEXTURE_LIMIT)?) != digest {
            return Err("Sticker cache hash mismatch".into());
        }
        Ok(digest)
    })();
    let _ = fs::remove_file(temporary);
    result
}

#[derive(serde::Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct CachedRecipe { recipe_id: String, exporter: String, model_hash: String, texture_hash: String }
fn cache_index(root: &Path, recipe: &Recipe) -> Result<std::path::PathBuf, String> {
    crate::assets::game_destination(root, &format!("models/16competitive/st/recipe-{}-{}.json", recipe.id, &hash(SCRIPT.as_bytes())[..16]))
}
fn cached_recipe(root: &Path, recipe: &Recipe) -> Option<(String,String)> {
    let saved: CachedRecipe = serde_json::from_slice(&read(&cache_index(root,recipe).ok()?,2048).ok()?).ok()?;
    let valid_hash = |h: &str| h.len()==64 && h.bytes().all(|c| c.is_ascii_digit() || (b'a'..=b'f').contains(&c));
    if saved.recipe_id != recipe.id || saved.exporter != hash(SCRIPT.as_bytes()) || !valid_hash(&saved.model_hash) || !valid_hash(&saved.texture_hash) { return None; }
    for (digest,extension,limit) in [(&saved.model_hash,"mdl",MODEL_LIMIT),(&saved.texture_hash,"rgba",TEXTURE_LIMIT)] {
        let path=crate::assets::game_destination(root,&format!("models/16competitive/st/{}.{}",&digest[..32],extension)).ok()?;
        if hash(&read(&path,limit).ok()?) != *digest { return None; }
    }
    Some((saved.model_hash,saved.texture_hash))
}
fn save_recipe(root: &Path,recipe: &Recipe,model_hash: &str,texture_hash: &str) -> Result<(),String> {
    let saved=CachedRecipe {recipe_id:recipe.id.clone(),exporter:hash(SCRIPT.as_bytes()),model_hash:model_hash.into(),texture_hash:texture_hash.into()};
    crate::native_session::owned_write(&cache_index(root,recipe)?, &serde_json::to_vec(&saved).map_err(|_|"Sticker cache metadata failed")?)
}

pub fn prepare(
    root: &Path,
    session: &Path,
    api: &str,
    token: &str,
    match_id: &str,
) -> Result<(), String> {
    let agent = crate::assets::api(api, token)?;
    let bytes = crate::assets::request(
        &agent,
        &format!("{api}/matches/{match_id}/stickers"),
        token,
        128 * 1024,
    ).map_err(|_| "STICKER_REQUEST_FAILED")?;
    let recipes = recipes(&bytes)
        .map_err(|error| crate::desktop_session::preparation_error(&error, "STICKER_RECIPE_INVALID"))?;
    if recipes.is_empty() {
        return Ok(());
    }
    let root_text = root
        .to_str()
        .filter(|s| !s.contains(['\r', '\n', '\t']))
        .ok_or("STICKER_SOURCE_FAILED")?;
    let mut rows = format!("16c-stickers-v2\n{root_text}\n");
    let mut texture_rows = "16c-sticker-textures-v1\n".to_string();
    let deadline = Instant::now() + Duration::from_secs(120);
    for recipe in recipes {
        if Instant::now() >= deadline {
            return Err("STICKER_TIMEOUT".into());
        }
        let source = read(
            &crate::assets::game_destination(root, &recipe.source_path)
                .map_err(|_| "STICKER_SOURCE_FAILED")?,
            MODEL_LIMIT,
        ).map_err(|error| crate::desktop_session::preparation_error(&error, "STICKER_SOURCE_FAILED"))?;
        if hash(&source) != recipe.source_sha256 {
            return Err("Sticker source hash mismatch".into());
        }
        let (model_hash,texture_hash) = if let Some(saved) = cached_recipe(root,&recipe) {
            saved
        } else {
            let mut images = Vec::new();
            for artwork in &recipe.stickers {
                let bytes = crate::assets::request(&agent,&format!("{api}/fastdl/{}",artwork.image_path),token,2_000_000)
                    .map_err(|_| "STICKER_ARTWORK_REQUEST_FAILED")?;
                if Some(hash(&bytes).as_str()) != artwork.image_path.split('/').nth(3) { return Err("Sticker artwork hash mismatch".into()); }
                images.push(pixels(&bytes).map_err(|_| "STICKER_IMAGE_INVALID")?);
            }
            let (model,textures)=bake(&recipe,source,images)
                .map_err(|error| crate::desktop_session::preparation_error(&error, "STICKER_BAKE_FAILED"))?;
            let model_hash=immutable(root,&model,"mdl").map_err(|_| "STICKER_CACHE_FAILED")?;
            let texture_hash=immutable(root,&textures,"rgba").map_err(|_| "STICKER_CACHE_FAILED")?;
            save_recipe(root,&recipe,&model_hash,&texture_hash).map_err(|_| "STICKER_CACHE_FAILED")?;
            (model_hash,texture_hash)
        };
        rows.push_str(&format!(
            "{}\t{model_hash}\t{}\t{}\n",
            recipe.id, recipe.source_path, recipe.source_sha256
        ));
        texture_rows.push_str(&format!("{}\t{model_hash}\t{texture_hash}\n", recipe.id));
    }
    crate::native_session::owned_write(&session.join("stickers.tsv"), rows.as_bytes())
        .map_err(|_| "STICKER_SESSION_WRITE_FAILED")?;
    crate::native_session::owned_write(
        &session.join("sticker-textures.tsv"),
        texture_rows.as_bytes(),
    ).map_err(|_| "STICKER_SESSION_WRITE_FAILED".into())
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn embedded_parser_rejects_untrusted_paths_and_recipe_ids() {
        assert!(recipes(br#"{"recipes":[]}"#).unwrap().is_empty());
        assert!(recipes(br#"{"recipes":[{"sourcePath":"../outside"}]}"#).is_err());
        assert!(recipes(br#"{"recipes":[{"version":1,"id":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa","sourcePath":"models/16competitive/a/v.mdl","sourceSha256":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa","stickers":[]}]}"#).is_err());
    }
    #[test]
    fn reconnect_reuses_verified_cache_and_rejects_modified_bytes() {
        let root=std::env::temp_dir().join(format!("16c-sticker-cache-{}",uuid::Uuid::new_v4()));
        fs::create_dir_all(&root).unwrap();
        let bytes=b"immutable fixture";
        let first=immutable(&root,bytes,"mdl").unwrap();
        let path=root.join(format!("models/16competitive/st/{}.mdl",&first[..32]));
        let modified=fs::metadata(&path).unwrap().modified().unwrap();
        assert_eq!(immutable(&root,bytes,"mdl").unwrap(),first);
        assert_eq!(fs::metadata(&path).unwrap().modified().unwrap(),modified);
        fs::write(&path,b"modified").unwrap();
        assert_eq!(immutable(&root,bytes,"mdl").unwrap(),hash(bytes));
        assert_eq!(fs::read(&path).unwrap(),bytes);
        fs::remove_dir_all(root).unwrap();
    }
    #[test]
    fn saved_recipe_skips_rebaking_and_invalidates_modified_artifacts() {
        let root=std::env::temp_dir().join(format!("16c-sticker-recipe-{}",uuid::Uuid::new_v4()));
        fs::create_dir_all(&root).unwrap();
        let recipe=Recipe {id:"a".repeat(32),source_path:"models/v_ak47.mdl".into(),source_sha256:"b".repeat(64),canonical:String::new(),stickers:vec![]};
        let model=immutable(&root,b"model pixels","mdl").unwrap();
        let textures=immutable(&root,b"texture pixels","rgba").unwrap();
        assert!(cached_recipe(&root,&recipe).is_none());
        save_recipe(&root,&recipe,&model,&textures).unwrap();
        assert_eq!(cached_recipe(&root,&recipe),Some((model.clone(),textures.clone())));
        let file=crate::assets::game_destination(&root,&format!("models/16competitive/st/{}.rgba",&textures[..32])).unwrap();
        fs::write(&file,b"modified").unwrap();
        assert!(cached_recipe(&root,&recipe).is_none());
        assert_eq!(immutable(&root,b"texture pixels","rgba").unwrap(),textures);
        assert_eq!(cached_recipe(&root,&recipe),Some((model,textures)));
        fs::remove_dir_all(root).unwrap();
    }
    #[test]
    fn png_decoder_rejects_non_images() {
        assert!(pixels(b"not an image").is_err());
    }

    #[test]
    #[ignore = "requires an external stock model; run with STICKER_TEST_MODEL"]
    fn stock_model_bakes_in_embedded_engine() {
        let source =
            fs::read(std::env::var_os("STICKER_TEST_MODEL").expect("STICKER_TEST_MODEL")).unwrap();
        let content = format!(
            r#"{{"version":1,"sourcePath":"models/v_ak47.mdl","sourceSha256":"{}","stickers":[{{"imagePath":"media/16competitive/stickers/{}/image.png","projection":{{"center":[20,-5,0],"right":[1,0,0],"up":[0,0,1],"normal":[0,-1,0],"size":0.2,"angle":0}}}}]}}"#,
            hash(&source),
            "a".repeat(64)
        );
        let id = hash(content.as_bytes())[..32].to_string();
        let mut value: serde_json::Value = serde_json::from_str(&content).unwrap();
        value["id"] = id.into();
        let input = serde_json::json!({"recipes":[value]}).to_string();
        let recipe = recipes(input.as_bytes()).unwrap().remove(0);
        let image = || Pixels {
            width: 4,
            height: 4,
            rgba: [230, 40, 20, 255].repeat(16),
        };
        let (model, textures) = bake(&recipe, source.clone(), vec![image()]).unwrap();
        assert_eq!(&model[..4], b"IDST");
        assert_eq!(&textures[..8], b"16CRGBA1");
        assert!(u32::from_le_bytes(textures[8..12].try_into().unwrap()) > 0);
        assert_eq!(u32::from_le_bytes(textures[16..20].try_into().unwrap()), 2048);
        assert_eq!(u32::from_le_bytes(textures[20..24].try_into().unwrap()), 2048);
        assert_ne!(model, source);
        let again = bake(&recipe, source, vec![image()]).unwrap();
        assert_eq!(model, again.0);
        assert_eq!(textures, again.1);
        if let Some(directory) = std::env::var_os("STICKER_TEST_OUTPUT_DIR") {
            fs::create_dir_all(&directory).unwrap();
            fs::write(Path::new(&directory).join("native.mdl"), model).unwrap();
            fs::write(Path::new(&directory).join("native.rgba"), textures).unwrap();
        }
    }
}
