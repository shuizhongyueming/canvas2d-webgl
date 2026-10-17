import { createCompatError } from "../../src/contracts/errors.js";
import type { FeatureFactory } from "../../src/internal/contracts.js";
import { SUPPORT_MATRIX } from "../../src/contracts/support.js";
createCompatError("resource-limit", "bounded allocation");
// @ts-expect-error Stable errors must not silently accept misspelled codes.
createCompatError("resouce-limit", "typo");
// @ts-expect-error Required under noUncheckedIndexedAccess: the index may be absent.
const name: string = SUPPORT_MATRIX[9999].name;
// @ts-expect-error Shared feature factories must return the owned descriptor contract.
const invalidFactory: FeatureFactory = () => ({ id: "rect", members: 42 });
void name;
void invalidFactory;
