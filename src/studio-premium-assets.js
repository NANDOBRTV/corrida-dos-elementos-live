// Real, artist-authored car assets under CC BY 4.0, used only with visible
// attribution and a mobile LOD fallback. Do not confuse the catalog's mislabeled
// "volkswagen-gol.glb" (actually a Golf MK1) with a Brazilian Gol.
export const SOURCE_REPOSITORY="https://github.com/pedrosoandre/carros";
export const SOURCE_COMMIT="2d18dfd9db96bbf0d9cffa949deaf7f571388cbf";
export const PREMIUM_HERO_MODELS=Object.freeze({
  "car-fusca":Object.freeze({
    file:"volkswagen-fusca.glb",bytes:4211900,author:"cacatua",
    source:"https://sketchfab.com/3d-models/2c7d8fc79824428b97ce5f56629d0ed1",
    material:"Carcaa",license:"CC BY 4.0"
  }),
  "car-uno":Object.freeze({
    file:"fiat-uno.glb",bytes:290120,author:"subishi",
    source:"https://sketchfab.com/3d-models/f5e38b26c0af4ef2ab2f4c4b2e5aad5c",
    material:"Scene_-_Root",license:"CC BY 4.0"
  }),
  "car-palio":Object.freeze({
    file:"fiat-palio.glb",bytes:317144,author:"Fall0X",
    source:"https://sketchfab.com/3d-models/8a3e71d4b4234110b59b09ef663e9448",
    material:"g1m1",license:"CC BY 4.0"
  }),
  "car-civic":Object.freeze({
    file:"honda-civic.glb",bytes:331484,author:"rifdanzz",
    source:"https://sketchfab.com/3d-models/f81da34570b145deb463fa091604d251",
    material:"Car_Paint",license:"CC BY 4.0"
  }),
  "car-opala":Object.freeze({
    file:"chevrolet-opala.glb",bytes:1029156,author:"coptrum",
    source:"https://sketchfab.com/3d-models/9a54b1a9aa9a4b7b92a2b35dda15297c",
    material:null,license:"CC BY 4.0"
  })
});
export const PREMIUM_CAR_IDS=Object.freeze(Object.keys(PREMIUM_HERO_MODELS));
export const premiumModelUrl=id=>{
  const model=PREMIUM_HERO_MODELS[id];
  return model?"/assets/models/"+model.file:null;
};
export const remoteModelUrl=id=>{
  const model=PREMIUM_HERO_MODELS[id];
  return model?"https://raw.githubusercontent.com/pedrosoandre/carros/"+
    SOURCE_COMMIT+"/assets/"+model.file:null;
};
