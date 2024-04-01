import { ChangeNotifier } from "./ChangeNotifier";


type Primitive = string | symbol
type ObjectDescriptor = {id: Primitive, type: Primitive}
type Properties = {
  [key: PropertyKey]: ObjectDescriptor
}
type PropertiesMap = Map<ObjectDescriptor, Properties>
type StoreObserver = (map: PropertiesMap) => Promise<any>
interface Store{
  getTypeSerialized(value: any): ObjectDescriptor
  getValue(desc: ObjectDescriptor): any
  set(map: PropertiesMap): Promise<any>
  setObserver(obs: StoreObserver): void
}



export type PropsChanged = {
  [key: string | symbol]: {value: unknown} | undefined
}

export type Changes = Map<object, PropsChanged>

export type ChangeObserver = (changed: Changes)=>Promise<any>
export interface Changer{
  set(changes: Changes): void
  setObserver(obs: ChangeObserver): void
  proxify(obj: object): object
}

export interface IAliveObjects{
  store(obj: object): object
  restore(desc: ObjectDescriptor): object
}

type FinalizationKey = {desc: ObjectDescriptor, clear: ()=>void, thisRef: WeakRef<object>}

class AliveObjects{
  FinalizationRegistry = new FinalizationRegistry(({desc, clear, thisRef}: FinalizationKey)=>{
    const {type, id} = desc
    clear()
  })
  constructor(
    private readonly storage: Store,
    private readonly changer: Changer
  ){
    storage.setObserver
  }
  clientObserver: ChangeObserver = (changed) => {
    return new Promise(()=>undefined)
  }
  storageObserver: StoreObserver = (changed) =>{
    return new Promise(()=>undefined)
  } 
  store(object: object){
    return this.changer.proxify(object)
  }

}


export const DivideProps = (descs: PropsChanged) => {
  const toDefine: PropertyDescriptorMap = {}
  const toDelete: PropertyKey[] = []
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