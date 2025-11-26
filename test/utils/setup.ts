import { loadFixture } from "@nomicfoundation/hardhat-toolbox/network-helpers";
import { pluginFixture } from "../shared/fixtures";
import { impersonate } from "../shared/helpers";

export async function setup(numUsers: number = 2) {
    const f = () => pluginFixture(numUsers)
    const vars = await loadFixture(f);
    const poolSigner = await impersonate(vars.poolAddr);

    return {
        ...vars,
        poolSigner
    };
}