import { Description, Keys, Observer, RawDescriptors, Scope } from "./Scope"
export type PropsChanged = {
  [key: string | symbol]: {value: unknown} | undefined
}

export type CommonPropsChanged = Map<object, PropsChanged>
export type PropertyObserver<T extends object> = (t: T, props: PropsChanged)=>Promise<void>

type ChangeNotifyFunction = <T extends object>(target: T, observer: PropertyObserver<T>)=>T
type FinalizationKey = {type: Keys, serialized: Keys, clear: ()=>void, thisRef: WeakRef<object>}

class ObjectStore<SCOPE extends Scope<any>>{
  ReadyProxiesSD = new Map<Keys, Map<unknown, Set<WeakRef<object>>>>()
  ReadySet = new WeakSet<object>()
  offObserve = false
  FinalizationRegistry = new FinalizationRegistry(({type, serialized, clear, thisRef}: FinalizationKey)=>{
    clear()
    const map = this.ReadyProxiesSD.get(type)
    const set = map!.get(serialized)
    set?.delete(thisRef)
    if(set?.size===0)map!.delete(serialized)
  })
  constructor(
    public scope: SCOPE,
    public notifyChanges: ChangeNotifyFunction //has to syncroniusly notify about changes
  ){
    for(const type in this.scope.descriptions){
      this.ReadyProxiesSD.set(type, new Map())
    }
  }
  async restoreOrStore<T extends object>(target: T){
    const type = this.scope.getValueType(target)
    const serialized = this.scope.getTypeDescriptor(type).serialize(target)
    return this.restore(serialized, type)
  }
  
  async store<T>(target: T): Promise<unknown> { 
    const type = this.scope.getValueType(target)
    const desc: Description<T, Keys> = this.scope.getTypeDescriptor(type)
    const serialized = desc.typeDescriptor.serialize(target)
    const storage = desc.store
    if(!storage)return serialized

    if(typeof target!=='object' || target === null)throw new Error('not object wtf')
    if(this.ReadySet.has(target))return serialized

    const props = Object.getOwnPropertyDescriptors(target)
    const propsValues: {[k: Keys]: {value: unknown} | undefined} = {}
    for(const i in props){
      if('value' in props[i]){
        propsValues[i]=props[i].value
      }
    }
    const propsToStore = await this.storeProps(propsValues)

    const clear = await storage.subscribe(serialized, type, propsToStore, this.observer)
    this.notifyChanges(target, this.applyChanges)
    this.toGB(serialized,type, target, clear)
    
    return serialized
  }
  applyManyChanges = (changed: CommonPropsChanged) => {
    const promises: Promise<any>[] = []
    for(const objprops of changed){
      const [obj, props] = objprops
      promises.push(this.applyChanges(obj, props))
    }
    return Promise.all(promises)
  }
  applyChanges: PropertyObserver<object> = async (target, props) => {
    if(this.offObserve)return
    const type = this.scope.getValueType(target)
    const desc: Description<object, Keys> = this.scope.getTypeDescriptor(type)
    const serialized = desc.typeDescriptor.serialize(target)

    this.spyDefine(serialized, type, props)

    const toStore = await this.storeProps(props)
    return await desc.store!.set(serialized, type, toStore)
  } 
  async storeProps(props: PropsChanged): Promise<RawDescriptors>{
    const serializedPropsPromises: Promise<{value: unknown, type: Keys} | undefined>[] = []
    const serializedPropsKeys: Keys[] = []
    for(const propKey in props){
      const prop = props[propKey]
      if(prop===undefined){
        serializedPropsKeys.push(propKey)
        serializedPropsPromises.push(Promise.resolve(undefined))
      }else{
        const propType = this.scope.getValueType(prop.value)
        const propValuePromise = this.store(prop.value)
        serializedPropsKeys.push(propKey)
        serializedPropsPromises.push(propValuePromise.then(value=>({value, type: propType})))
      }
    }
    const res = await Promise.all(serializedPropsPromises)
    const serialized: RawDescriptors = {}
    for(const i in res){
      serialized[serializedPropsKeys[i]] = res[i]
    }
    return serialized
  }
  //TODO zamena id
  toGB(serialized: Keys, type: Keys, object: object, clear: ()=>void){
    this.ReadySet.add(object)
    const thisRef = new WeakRef(object)
    const map = this.ReadyProxiesSD.get(type)
    let set = map!.get(serialized)
    if(!set){
      set = new Set<WeakRef<object>>()
      map!.set(serialized, set)
    }
    set.add(thisRef)
    this.FinalizationRegistry.register(object, {serialized, type, clear, thisRef})
  }

  getStoredObjectsIfNotGarbageCollected(serialized: unknown, type: Keys){
    return this.ReadyProxiesSD.get(type)!.get(serialized)?.values()
  }

  async restore(serialized: Keys, type: Keys): Promise<unknown> {
    const propType: Description<unknown, Keys> = this.scope.getTypeDescriptor(type)
    const des = propType.typeDescriptor.deserialize(serialized)
    if(propType.store){
      const res = this.getStoredObjectsIfNotGarbageCollected(serialized, type)?.next().value || await this.store(des)
      return res
    }
    return des
  }

  async restoreProps(props: RawDescriptors): Promise<PropsChanged>{
    const keys: Keys[] = []
    const values: Promise<{value: unknown} | undefined>[] = []
    for(const prop in props){
      if(!props[prop]){
        keys.push(prop)
        values.push(Promise.resolve(undefined))
      }else{
        const propValue = props[prop]!.value
        const propTypeName = props[prop]!.type
        const des = this.restore(propValue, propTypeName)
        keys.push(prop)
        values.push(des.then(value=>({value})))
      }
    }
    const resolved = await Promise.all(values)
    const descs: PropsChanged = {}
    for(const i in keys){
      descs[keys[i]] = resolved[i]
    }
    return descs
  }

  observer: Observer<Keys> = async (serialized: Keys, type: Keys, props: RawDescriptors) => {
    const descs = await this.restoreProps(props)
    this.spyDefine(serialized, type, descs)
  }

  spyDefine(serialized: Keys, type: Keys, descs: PropsChanged){
    const objs = this.getStoredObjectsIfNotGarbageCollected(serialized, type)
    if(!objs)return
    const {toDefine, toDelete} = DivideProps(descs)
    const prev = this.offObserve 
    this.offObserve = true
    try{
      for(const obj of objs){
        toDelete.forEach(p=>Reflect.deleteProperty(obj, p))
        Object.defineProperties(obj, toDefine)
      }
    }catch(e){
      throw e
    }finally{
      this.offObserve = prev
    }
  }
}

export const DivideProps = (descs: PropsChanged) => {
  const toDefine: PropertyDescriptorMap = {}
  const toDelete: Keys[] = []
  for(const i in descs){
    const desc = descs[i]
    if(desc){
      toDefine[i] = desc
    }else{
      toDelete.push(i)
    }
  }
  return {toDefine, toDelete}
}
