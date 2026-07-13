/**
 * Merge Contract Utility
 * 
 * This module provides utility functions for merging multi-asset data structures
 * used in Cardano transactions and other blockchain operations.
 */

import {
  MultiAsset,
  Assets,
  ScriptHash,
  AssetName,
  BigNum,
} from "@emurgo/cardano-serialization-lib-nodejs";

/**
 * Merges two MultiAsset objects by combining their policy IDs and asset names.
 * If both MultiAssets contain the same policy and asset, their quantities are summed.
 * 
 * @param a - First MultiAsset to merge
 * @param b - Second MultiAsset to merge
 * @returns A new MultiAsset containing all assets from both inputs with combined quantities
 * 
 * @example
 * const merged = mergeMultiAssets(multiAssetA, multiAssetB);
 */
export function mergeMultiAssets(a: MultiAsset, b: MultiAsset): MultiAsset {
  const result = MultiAsset.new();

  // Helper function to add assets from a MultiAsset to result
  const addToResult = (source: MultiAsset) => {
    const policies = source.keys();
    
    for (let i = 0; i < policies.len(); i++) {
      const policyId = policies.get(i);
      const sourceAssets = source.get(policyId);
      
      if (!sourceAssets) continue;

      // Get or create assets for this policy in result
      let resultAssets = result.get(policyId);
      if (!resultAssets) {
        resultAssets = Assets.new();
        result.insert(policyId, resultAssets);
      }

      // Add each asset under this policy
      const assetNames = sourceAssets.keys();
      for (let j = 0; j < assetNames.len(); j++) {
        const assetName = assetNames.get(j);
        const sourceQuantity = sourceAssets.get(assetName);
        
        if (!sourceQuantity) continue;

        // If asset already exists in result, add quantities
        const existingQuantity = resultAssets.get(assetName);
        if (existingQuantity) {
          const combined = existingQuantity.checked_add(sourceQuantity);
          resultAssets.insert(assetName, combined);
        } else {
          // Otherwise, just insert the new asset
          resultAssets.insert(assetName, sourceQuantity);
        }
      }

      // Update the policy assets in result
      result.insert(policyId, resultAssets);
    }
  };

  // Merge both MultiAssets into result
  addToResult(a);
  addToResult(b);

  return result;
}

/**
 * Creates a deep copy of a MultiAsset object
 * 
 * @param source - MultiAsset to clone
 * @returns A new MultiAsset with the same contents
 */
export function cloneMultiAsset(source: MultiAsset): MultiAsset {
  const clone = MultiAsset.new();
  const policies = source.keys();

  for (let i = 0; i < policies.len(); i++) {
    const policyId = policies.get(i);
    const sourceAssets = source.get(policyId);
    
    if (!sourceAssets) continue;

    const clonedAssets = Assets.new();
    const assetNames = sourceAssets.keys();

    for (let j = 0; j < assetNames.len(); j++) {
      const assetName = assetNames.get(j);
      const quantity = sourceAssets.get(assetName);
      
      if (quantity) {
        clonedAssets.insert(assetName, quantity);
      }
    }

    clone.insert(policyId, clonedAssets);
  }

  return clone;
}

/**
 * Converts MultiAsset to a readable object format for debugging
 * 
 * @param multiAsset - MultiAsset to convert
 * @returns Object with policy IDs as keys and asset maps as values
 */
export function multiAssetToObject(multiAsset: MultiAsset): Record<string, Record<string, string>> {
  const result: Record<string, Record<string, string>> = {};
  const policies = multiAsset.keys();

  for (let i = 0; i < policies.len(); i++) {
    const policyId = policies.get(i);
    const assets = multiAsset.get(policyId);
    
    if (!assets) continue;

    const policyHex = Buffer.from(policyId.to_bytes()).toString('hex');
    result[policyHex] = {};

    const assetNames = assets.keys();
    for (let j = 0; j < assetNames.len(); j++) {
      const assetName = assetNames.get(j);
      const quantity = assets.get(assetName);
      
      if (quantity) {
        const nameHex = Buffer.from(assetName.name()).toString('hex');
        result[policyHex][nameHex] = quantity.to_str();
      }
    }
  }

  return result;
}

/**
 * Checks if a MultiAsset is empty (contains no assets)
 * 
 * @param multiAsset - MultiAsset to check
 * @returns true if empty, false otherwise
 */
export function isMultiAssetEmpty(multiAsset: MultiAsset): boolean {
  return multiAsset.keys().len() === 0;
}

/**
 * Gets the total number of different asset types in a MultiAsset
 * 
 * @param multiAsset - MultiAsset to count
 * @returns Total number of unique assets across all policies
 */
export function countAssets(multiAsset: MultiAsset): number {
  let count = 0;
  const policies = multiAsset.keys();

  for (let i = 0; i < policies.len(); i++) {
    const policyId = policies.get(i);
    const assets = multiAsset.get(policyId);
    
    if (assets) {
      count += assets.keys().len();
    }
  }

  return count;
}

/**
 * Subtracts MultiAsset b from MultiAsset a
 * Throws error if any asset in b is greater than in a
 * 
 * @param a - MultiAsset to subtract from
 * @param b - MultiAsset to subtract
 * @returns New MultiAsset with b subtracted from a
 * @throws Error if subtraction would result in negative quantity
 */
export function subtractMultiAssets(a: MultiAsset, b: MultiAsset): MultiAsset {
  const result = cloneMultiAsset(a);
  const policies = b.keys();

  for (let i = 0; i < policies.len(); i++) {
    const policyId = policies.get(i);
    const bAssets = b.get(policyId);
    
    if (!bAssets) continue;

    const resultAssets = result.get(policyId);
    if (!resultAssets) {
      throw new Error(`Cannot subtract asset from policy ${Buffer.from(policyId.to_bytes()).toString('hex')} - not found in source`);
    }

    const assetNames = bAssets.keys();
    for (let j = 0; j < assetNames.len(); j++) {
      const assetName = assetNames.get(j);
      const bQuantity = bAssets.get(assetName);
      
      if (!bQuantity) continue;

      const resultQuantity = resultAssets.get(assetName);
      if (!resultQuantity) {
        throw new Error(`Cannot subtract asset - not found in source`);
      }

      const compared = resultQuantity.compare(bQuantity);
      if (compared < 0) {
        throw new Error(`Cannot subtract - would result in negative quantity`);
      }

      const newQuantity = resultQuantity.clamped_sub(bQuantity);
      
      // Only keep the asset if quantity > 0
      if (newQuantity.compare(BigNum.from_str("0")) > 0) {
        resultAssets.insert(assetName, newQuantity);
      }
    }

    result.insert(policyId, resultAssets);
  }

  return result;
}

/**
 * Filters a MultiAsset to only include specific policy IDs
 * 
 * @param multiAsset - Source MultiAsset
 * @param policyIds - Array of policy ID hex strings to include
 * @returns New MultiAsset containing only the specified policies
 */
export function filterMultiAssetByPolicies(
  multiAsset: MultiAsset,
  policyIds: string[]
): MultiAsset {
  const result = MultiAsset.new();
  const policies = multiAsset.keys();

  for (let i = 0; i < policies.len(); i++) {
    const policyId = policies.get(i);
    const policyHex = Buffer.from(policyId.to_bytes()).toString('hex');
    
    if (policyIds.includes(policyHex)) {
      const assets = multiAsset.get(policyId);
      if (assets) {
        result.insert(policyId, assets);
      }
    }
  }

  return result;
}
