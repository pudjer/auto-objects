import { Changer, Changes, DivideProps, PropsChanged } from "./StoreRefactor"
import { ChangeObserver } from "./StoreRefactor"



export class ChangeNotifier implements Changer{
  ready = new WeakMap<object, object>()
  transaction?: Changes
  lastPromise: Promise<any> = Promise.resolve()
  offObserve: boolean = false
  rollbacks = new Set<Changes>()
  outerObserver: ChangeObserver = ()=>Promise.resolve()

  setObserver(obs: ChangeObserver): void {
    this.outerObserver = obs
  }

  proxify(obj: object){
    const ready = this.ready.get(obj)
    if(ready)return ready
    const proxy = NotifyWriteProxy(obj, this.observer)
    this.ready.set(obj, proxy)
    this.ready.set(proxy, proxy)
    return proxy
  }

  private observer = (t: object, prop: PropertyKey) => {
    if(this.offObserve)return
    const pseudoTransaction = this.transaction ? false : true
    if(pseudoTransaction)this.transaction = new Map()
    const proxied = this.ready.get(t)!
    const propsChanged: PropsChanged = this.transaction!.get(proxied) || {}
    this.transaction!.set(proxied, propsChanged)
    if(!Object.hasOwn(propsChanged, prop)){
      const desc = Reflect.getOwnPropertyDescriptor(t, prop)
      propsChanged[prop] = desc && {value: desc.value}
    }
    if(pseudoTransaction)this.commit()
  }

  startTransaction = () => {
    this.transaction = this.transaction || new Map()
  }
  commit = async (): Promise<any> => {
    if(!this.transaction)throw Error('nothing to commit')
    const writenProps = this.transaction
    delete this.transaction
    const changed = this.getCommonChangedProps(writenProps)
    const initial = this.getInitial(writenProps, changed)
    this.rollbacks.add(initial)
    this.lastPromise = this.lastPromise.then(res=>this.outerObserver(changed).then(()=>{this.rollbacks.delete(initial); return res}))
    return this.lastPromise.catch(e=>{this.rollback();return Promise.reject(e)})
  }
  private getCommonChangedProps(CommonPropsChanged: Changes): Changes {
    const commonPropsChanged: Changes = new Map() 
    CommonPropsChanged.forEach((changed, obj)=>{
      commonPropsChanged.set(obj, this.getChangedProps(obj, changed))
    })
    return commonPropsChanged
  }
  
  private getChangedProps(target: object, writenProps: PropsChanged): PropsChanged{
    const changedProps: PropsChanged = {}
    for(const prop in writenProps){
        const oldProp = writenProps[prop]
        const newProp = Reflect.getOwnPropertyDescriptor(target, prop)
        if(oldProp!==newProp && (!oldProp || !newProp || oldProp.value===newProp.value)){
          changedProps[prop] = newProp && {value: newProp.value}
        }
      }
    return changedProps
  }
  private getInitial(writenProps: Changes, changed: Changes){
    const initialMap: Changes = new Map() 
    for(const objchanged of changed){
      const [obj, changed] = objchanged
      const initialProps = writenProps.get(obj)!
      const initialOnlyChanged: PropsChanged = {}
      for(const key in changed){
        const initialProp = initialProps[key]
        initialOnlyChanged[key] = initialProp
      }
      initialMap.set(obj, initialOnlyChanged)
    }
    return initialMap
  }
  private rollback(){
    const toReverse: Changes[] = []
    for(const toSet of this.rollbacks){
      toReverse.push(toSet)
    }
    this.rollbacks.clear()
    toReverse.reverse()
    toReverse.forEach(toSet=>this.set(toSet))
  }
  set(map: Changes){
    const prev = this.offObserve 
    this.offObserve = true
    try{
      for(const objprops of map){ 
        const [obj, props] = objprops
        const {toDefine, toDelete} = DivideProps(props)
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

const NotifyWriteProxy = <T extends object>(obj: T, willBeWriten: (target: T, prop: PropertyKey)=>void) => new Proxy(obj, {
  defineProperty(t, p, a){
    willBeWriten(t, p)
    return Reflect.defineProperty(t, p, a)
  },
  deleteProperty(t, p){
    willBeWriten(t, p)
    return Reflect.deleteProperty(t, p)
  }
})
