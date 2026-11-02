// Storage must be strongly consistent and implement Durable Object transaction/get/put.
export class UncertainStep extends Error {}
export class BeforeEffectError extends Error {}

export class Journal {
  constructor(storage) { this.storage = storage; }
  async reconcile(key, lookup) {
    const state=await this.storage.get(key);
    if (!state || state.status==='done') throw new Error('Only an uncertain step needs reconciliation');
    // lookup MUST query the provider/canonical file store; never infer from a timeout.
    const result=await lookup();
    if (result?.confirmed !== true || result.value === undefined) throw new UncertainStep('No provider evidence; step stays blocked');
    await this.storage.transaction(async tx=>{
      const fresh=await tx.get(key);
      if(fresh?.status!=='started') throw new Error('Step changed during reconciliation');
      await tx.put(key,{status:'done',value:result.value});
    });
    return result.value;
  }
  async once(key, effect) {
    const claim = await this.storage.transaction(async tx => {
      const old = await tx.get(key);
      if (old?.status === 'done') return { cached: true, value: old.value };
      if (old) throw new UncertainStep(`${key}: reconcile before retrying`);
      await tx.put(key, { status: 'started' });
      return { cached: false };
    });
    if (claim.cached) return claim.value;
    try {
      const value = await effect();
      if (value === undefined) throw new Error('Missing step receipt');
      await this.storage.put(key, { status: 'done', value });
      return value;
    } catch (error) {
      // Only a provider-confirmed rejection BEFORE an effect may be retried.
      // A timeout, restart, or failure saving the receipt remains uncertain.
      if (error instanceof BeforeEffectError) await this.storage.delete(key);
      throw error;
    }
  }
}
