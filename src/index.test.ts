import { fn } from '@vitest/spy'
import {autorun, makeAutoObservable} from 'mobx'
import '.'
class A{
  constructor(){
    makeAutoObservable(this)
  }
  lol = 0
}

describe('', ()=>{
  it('',()=>{
    const a = new A()
    console.log(a)
    const foo = fn(()=>{
      console.log(a.lol)
    })
    autorun(foo)
    a.lol++
    expect(foo).toBeCalledTimes(2)
    console.log(Object.getOwnPropertyDescriptors(a))
  })
})