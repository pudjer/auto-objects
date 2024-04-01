
export class Scope<DESCS extends Descriptions<any>>{
  definedObjectTypes = new WeakMap<object, keyof DESCS>()
  definedConstantTypes = new Map<unknown, keyof DESCS>()
  definedDynamicTypes = new Map<(obj: any)=>boolean, keyof DESCS>()
  constructor(
    public descriptions: DESCS
  ){
    for(const key in descriptions){
      const desc = descriptions[key]
      if('isType' in desc){
        this.definedDynamicTypes.set(desc.isType.bind(desc), key)
      }
    }
  }

  getTypeDescriptor<key extends keyof DESCS>(name: key): DESCS[key] {
    return this.descriptions[name]
  }
  getValueType<T extends keyof DESCS>(value: unknown): T {
    if(typeof value === 'object' && value !== null){
      const res = this.definedObjectTypes.get(value)
      if(res)return res as T
    }

    const res = this.definedConstantTypes.get(value)
    if(res)return res as T

    for(const checkname of this.definedDynamicTypes){
      const [check, name] = checkname
      if(check(value))return name as T
    }
    
    console.error(value)
    throw new Error('type not registered')
  }
  defineValueType(value: unknown, name: keyof DESCS){
    if(typeof value === 'object'  && value !== null){
      this.definedObjectTypes.set(value, name)
    }else{
      this.definedConstantTypes.set(value, name)
    }
  }

}
export type Keys = string | symbol | number

export interface Descriptions<ADDITIONAL extends AdditionalInfo>{
  [key: Keys]: Description<unknown, Keys, ADDITIONAL>
}
export type AdditionalInfo = {
  [key: Keys]: any
}
export type Description<T, RAW extends Keys, ADDITIONAL extends AdditionalInfo = {}> = {
  typeDescriptor: TypeDescriptor<T,RAW>,
  store: T extends object ? Store<RAW> | undefined : undefined
} & ADDITIONAL

export interface TypeDescriptor<T, RAW extends Keys>{
  isType?(obj: T): boolean
  serialize(obj: T): RAW
  deserialize(fromStorage: RAW): T,
}

export type RawDescriptor<T> = {value: T, type: Keys}
export type RawDescriptors = {
  [prop: Keys]: RawDescriptor<unknown> | undefined
}

export type Observer<RAW> = (id: RAW, type: Keys, props: RawDescriptors)=>Promise<void>

export interface Store<RAW>{
  subscribe(id: RAW, type: Keys, props: RawDescriptors, observer: Observer<RAW>): Promise<()=>void>
  set(id: RAW, type: Keys, props: RawDescriptors): Promise<void>
}

