//Types for storage interactions
export type FieldKey = string | symbol
export type Serialized = string | number | null | boolean | bigint | undefined
export type Type = unknown
export type Version = string | number | bigint //greater or equal defined
export type Value<T, S> = { //just value-object, check its props not reference
  type: T,
  serialized: S,
  version?: Version,
} 

// versioning divided on object and property:
// assignable versions:
//  one of is undefined: ok
//  assignable greater or equal: ok
// object not assignable: it's undefined props not assignable

export type DeletedField = undefined
export type SField<T, S> = Value<T, S> | DeletedField
export type Update<T, S> = SField<T, S>
export type PropertiesUpdates<T, S> = {
  [key: FieldKey]: Update<T, S>
}

export type Updates<T, S> = Map<Update<T, S>, PropertiesUpdates<T, S>>

export type ValueDescriptor<T, S> = {
  value: unknown
  version?: Version
  clear?: ()=>void
  initalProps?: PropertiesUpdates<T, S>
}


export type ObserverOfStorage = (updates: Updates<unknown, unknown>) => Promise<void>
export interface Storage<T = Type, S = Serialized>{
  setObserver(observer: ObserverOfStorage): void
  get(value: Value<T, S>): Promise<ValueDescriptor<T,S>>
  set(updates: Updates<T, S>, readen: Updates<T, S> ): Promise<Updates<T,S>>
  serialize(target: unknown): Promise<Value<T, S>>
}

export type PropChanges = {
  [key: FieldKey]: any
}
export type DeletedProps = Iterable<FieldKey>
export type Changes = Map<object, PropChanges>
export type ObserverOfChanger = (changes: Changes, deleted: DeletedProps, readen: Changes) => Promise<void>
export interface Changer{
  setObserver(observer: ObserverOfChanger): void
  t(): void 
  c(): Promise<void> // should queue transactions 
  proxify(target: object): object
}

//mediator.get(type, serialized)
//check in map already proxified object(watch below)
//storage get({type , serialized}) returns value or raise some error 
//then resolves props of object recursevly with 
// const promsifiedProxified = Promise.all().then(()=>
//then assignes with method
//changer.proxify(object))
//mediator store this object in a map<type, map<serialized, weakRef{object, promsifiedProxified , version, props}>>> and register clear function in finalization registry
//and register it in WeakMap(object, promsifiedProxified)
//then return proxy

export type Info = {object: object, promiseToRefToProxified: Promise<WeakRef<object>>, version: Version, props: PropertiesUpdates<unknown, unknown>}
export type MAP = Map<any, Map<any, Info>>

export interface Mediator{
  observerOfChanger: ObserverOfChanger
  observerOfStorage: ObserverOfStorage
  get(value: Value<unknown, unknown>): Promise<unknown>
}

export interface Versioning{
  getAssignableProps(toAssign: Updates<unknown, unknown>, current: Updates<unknown, unknown>): Updates<unknown, unknown>

}