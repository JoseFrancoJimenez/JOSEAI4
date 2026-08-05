import { createDomainStores } from "./stores.domain.ts";
import { runStoreContractTests } from "./stores.contract.ts";

runStoreContractTests("createDomainStores", createDomainStores);
