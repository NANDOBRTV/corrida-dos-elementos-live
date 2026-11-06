import {test,expect} from "@playwright/test";

test.skip(process.env.TEST_PREMIUM_GLB!=="1","Requires licensed 5 premium models");
test("Gallery: verify each licensed GLB is correctly oriented with independent 3/4 camera",async({page})=>{
  await page.setViewportSize({width:1250,height:810});
  await page.goto("/?view=live&studioPreview=1&quality=high&crowd=6&hero=1",
    {waitUntil:"domcontentloaded"});
  const results=await page.evaluate(async()=>{
    const THREE=await import("three");
    const [{GLTFLoader},{MeshoptDecoder}]=await Promise.all([
      import("three/addons/loaders/GLTFLoader.js"),
      import("three/addons/libs/meshopt_decoder.module.js")
    ]);
    const loader=new GLTFLoader();
    loader.setMeshoptDecoder(MeshoptDecoder);
    const fleet=[
      ["Fusca","volkswagen-fusca.glb",1.76,2.83,1.54],
      ["Uno","fiat-uno.glb",1.63,2.63,1.65],
      ["Palio","fiat-palio.glb",1.72,2.81,1.50],
      ["Civic","honda-civic.glb",1.91,3.32,1.39],
      ["Opala","chevrolet-opala.glb",1.98,3.66,1.44]
    ];
    const root=document.createElement("div");
    root.id="premium-gallery";
    Object.assign(root.style,{position:"fixed",inset:"0",zIndex:"999999",
      display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:"8px",
      alignContent:"start",background:"#152132",padding:"12px"});
    document.body.append(root);
    const data=[];
    for(const [label,file,width,length,height] of fleet){
      const scene=new THREE.Scene();
      scene.background=new THREE.Color("#dce7f2");
      scene.add(new THREE.HemisphereLight(0xffffff,0x5f7082,2.0));
      const light=new THREE.DirectionalLight(0xffffff,2.8);
      light.position.set(-5,9,6);scene.add(light);
      const ground=new THREE.Mesh(new THREE.PlaneGeometry(12,12),
        new THREE.MeshStandardMaterial({color:"#b7c6d3",roughness:1}));
      ground.rotation.x=-Math.PI/2;ground.position.y=-.01;scene.add(ground);
      const gltf=await loader.loadAsync("/assets/models/"+file);
      const model=gltf.scene.clone(true);
      const pivot=new THREE.Group();pivot.add(model);pivot.updateMatrixWorld(true);
      let box=new THREE.Box3().setFromObject(pivot);
      let dims=box.getSize(new THREE.Vector3());
      if(dims.x>dims.z*1.1){
        pivot.rotation.y=Math.PI/2;pivot.updateMatrixWorld(true);
        box=new THREE.Box3().setFromObject(pivot);
        dims=box.getSize(new THREE.Vector3());
      }
      const container=new THREE.Group();
      const scale=new THREE.Group();
      scale.scale.set(width/dims.x,height/dims.y,length/dims.z);
      const center=box.getCenter(new THREE.Vector3());
      pivot.position.set(-center.x,-box.min.y,-center.z);
      scale.add(pivot);container.add(scale);scene.add(container);
      const camera=new THREE.PerspectiveCamera(47,400/275,.1,100);
      camera.position.set(4,3,6.8);camera.lookAt(0,.7,0);
      const renderer=new THREE.WebGLRenderer({
        antialias:true,preserveDrawingBuffer:true});
      renderer.setSize(400,275);renderer.setPixelRatio(1);
      const wrapper=document.createElement("section");
      const title=document.createElement("h3");
      title.textContent=label+" • "+[dims.x,dims.y,dims.z]
        .map(n=>n.toFixed(2)).join(" × ");
      Object.assign(title.style,{margin:"4px",color:"#fff",
        font:"bold 16px system-ui"});
      wrapper.append(title,renderer.domElement);root.append(wrapper);
      renderer.render(scene,camera);
      data.push({name:label,
        dims:[dims.x,dims.y,dims.z].map(x=>Number(x.toFixed(3))),
        rotations:[pivot.rotation.x,pivot.rotation.y,pivot.rotation.z]});
    }
    return data;
  });
  console.log("MODEL_GALLERY_DIMENSIONS:"+JSON.stringify(results));
  await expect(page.locator("#premium-gallery canvas")).toHaveCount(5);
  await page.locator("#premium-gallery").screenshot({
    path:"test-results/premium-five-models-gallery.jpg",type:"jpeg",quality:70});
  const img=await page.locator("#premium-gallery").screenshot({type:"jpeg",quality:48});
  console.log("VISUAL_IMAGE_PREMIUM_GALLERY:"+img.toString("base64"));
});
