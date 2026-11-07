import 'reflect-metadata';
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { FabricClientRegistry } from '../client/fabric-client.registry';
import { CHAINCODES, ChaincodeName } from '../fabric.constants';
import { FabricModule } from '../fabric.module';

@Module({ imports: [ConfigModule.forRoot({ isGlobal: true }), FabricModule] })
class SmokeModule { }

async function main(): Promise<void> {
  const app = await NestFactory.createApplicationContext(SmokeModule, {
    logger: ['error', 'warn', 'log'],
  });
  const registry = app.get(FabricClientRegistry);
  let failed = 0;

  for (const profile of registry.profiles()) {
    const client = registry.get(profile);
    console.log(`\n[${profile}] ${client.mspId} · ${client.channel}`);
    const missing = Object.keys(CHAINCODES).filter((c) => !client.chaincodes.includes(c));
    if (missing.length) {
      console.log(`FAIL   connection.json does not list: ${missing.join(', ')}`);
      failed++;
    }

    for (const name of Object.keys(CHAINCODES) as ChaincodeName[]) {
      const spec = CHAINCODES[name];
      try {
        const md = await client.getMetadata(name);
        const got = (md.contracts[spec.contract]?.transactions ?? []).map((t) => t.name).sort();
        const want = [...spec.functions].sort();
        if (JSON.stringify(got) === JSON.stringify(want)) {
          console.log(`OK     ${name} (${spec.contract}) ${got.length} functions`);
        } else {
          failed++;
          console.log(
            `FAIL   ${name}: functions differ\n         deployed: ${got.join(',') || '(contract not found)'}\n         expected: ${want.join(',')}`,
          );
        }
      } catch (err) {
        failed++;
        const e = err as { code?: number | string };
        console.log(`FAIL   ${name}: ${(err as Error).constructor.name} code=${e.code ?? '-'}`);
      }
    }
  }
  await app.close();
  console.log(failed === 0 ? '\nFabric smoke: ALL OK' : '\nFabric smoke: FAILURES');
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error(`Smoke aborted: ${(err as Error).message}`);
  process.exit(1);
});
