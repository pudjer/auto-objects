import { configure } from "mobx";

configure({
  enforceActions: "never",
  isolateGlobalState: true,
})