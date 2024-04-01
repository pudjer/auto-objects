import { Mediator, Value } from "./Types";

export class ConcreteMediator implements Mediator{
  get(value: Value<unknown, unknown>): Promise<unknown> {
    
  }
}