
const {app,BrowserWindow}=require('electron'),{readFileSync,writeFileSync}=require('fs'),{join}=require('path')
app.commandLine.appendSwitch('enable-unsafe-swiftshader')
app.commandLine.appendSwitch('use-gl','angle')
app.commandLine.appendSwitch('use-angle','swiftshader')
app.whenReady().then(async()=>{
 const w=new BrowserWindow({show:false,width:1600,height:650,useContentSize:true,transparent:true,webPreferences:{offscreen:true,backgroundThrottling:false,sandbox:true,contextIsolation:true,nodeIntegration:false}})
 const timer=setTimeout(()=>app.exit(1),90000)
 w.webContents.on('console-message',(_e,level,message)=>{if(level>=3)console.error(message)})
 try{
 await w.loadFile("/home/keenplify-fedora/16competitive-client/output/weekend-sticker-event/.preview-runtime/index.html")
 const dir='/home/keenplify-fedora/.steam/steam/steamapps/common/Half-Life/cstrike/models'
 const stickers=["4c43c1529b846f12d7f6756a7ae04f3c0722de2e646d13a367aa63c4e214ed3c","9716ecf8ec7fb3a3259efdc05bd08ed7a9d6093cad81312939c4e123a6ddc225","76d51b6970cdd62cc81d6a8bde8a21bcc86f1eae6ba3efb711a314782513c233"].map(hash=>[...readFileSync('/home/keenplify-fedora/.config/16competitive-client/game-assets/sticker-images/'+hash+'.png')])
 for(const model of [{"name":"awp-skin-1","weapon":"awp","path":"/home/keenplify-fedora/.config/16competitive-client/game-assets/models/16competitive/awp/592b0d9dff62c8c2/v.mdl"},{"name":"ak47-skin-2","weapon":"ak47","path":"/home/keenplify-fedora/.config/16competitive-client/game-assets/models/16competitive/ak47/43e4ad662ef31c4c/v.mdl","stickers":["4db8f4def784d6eb6f5f7ad922827fca29d53f445e46854cc51ca7b3b7c45f39","5514a697d48b3a7f7feecf61ea5da89b287ac9d676377ba8702177f9ef73e223","9716ecf8ec7fb3a3259efdc05bd08ed7a9d6093cad81312939c4e123a6ddc225"],"sizes":[0.1,0.1,0.1]},{"name":"m4a1-skin-2","weapon":"m4a1","path":"/home/keenplify-fedora/.config/16competitive-client/game-assets/models/16competitive/m4a1/9a43fd0389d41660/v.mdl","stickers":["5514a697d48b3a7f7feecf61ea5da89b287ac9d676377ba8702177f9ef73e223","36c44ad7f48f1fc8331cda56c295daf78c76559a58b8df8c8e247e9c0f7c449a","4db8f4def784d6eb6f5f7ad922827fca29d53f445e46854cc51ca7b3b7c45f39"],"sizes":[0.1,0.1,0.1]}]){
  const {weapon,name,path,stock=false}=model
  await w.webContents.executeJavaScript('mount('+JSON.stringify([...readFileSync(path)])+','+JSON.stringify(weapon)+','+stock+')')
  writeFileSync("/home/keenplify-fedora/16competitive-client/output/weekend-sticker-event"+'/'+name+'-plain.png',Buffer.from(await w.webContents.executeJavaScript('png()'),'base64'))
  if(false){console.log('captured',name);continue}
  const selectedStickers=model.stickers?model.stickers.map(hash=>[...readFileSync('/home/keenplify-fedora/.config/16competitive-client/game-assets/sticker-images/'+hash+'.png')]):stickers
  const placements=await w.webContents.executeJavaScript('decorate('+JSON.stringify(selectedStickers)+','+JSON.stringify(model.sizes||[.11,.12,.11])+')')
  writeFileSync("/home/keenplify-fedora/16competitive-client/output/weekend-sticker-event"+'/'+name+'-stickers.png',Buffer.from(await w.webContents.executeJavaScript('png()'),'base64'))
  writeFileSync("/home/keenplify-fedora/16competitive-client/output/weekend-sticker-event"+'/'+name+'-placements.json',JSON.stringify(placements,null,2))
  console.log(name,JSON.stringify(placements))
 }
 clearTimeout(timer);app.exit(0)
 }catch(e){console.error(e);app.exit(1)}
})