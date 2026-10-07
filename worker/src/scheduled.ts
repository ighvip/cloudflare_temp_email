import { Context } from 'hono';
import { cleanup } from './common'
import { CONSTANTS } from './constants'
import { getJsonSetting, saveSetting } from './utils';
import { CleanupSettings } from './models';
import { executeCustomSqlCleanup } from './admin_api/cleanup_api';
import { runUptimeProbe } from './uptime';

// crons = ["* * * * *", "0 0 * * *"] — every minute runs the uptime probes,
// the daily run performs the mail / address cleanup below
const CLEANUP_CRON = '0 0 * * *';

async function runCleanup(env: Bindings) {
    const autoCleanupSetting = await getJsonSetting<CleanupSettings>(
        { env: env, } as Context<HonoCustomType>,
        CONSTANTS.AUTO_CLEANUP_KEY
    );
    if (!autoCleanupSetting) {
        console.log("No auto cleanup settings found, skipping cleanup.");
        return;
    }
    console.log("autoCleanupSetting:", JSON.stringify(autoCleanupSetting));
    if (autoCleanupSetting.enableMailsAutoCleanup) {
        await cleanup(
            { env: env, } as Context<HonoCustomType>,
            "mails",
            autoCleanupSetting.cleanMailsDays
        );
    }
    if (autoCleanupSetting.enableUnknowMailsAutoCleanup) {
        await cleanup(
            { env: env, } as Context<HonoCustomType>,
            "mails_unknow",
            autoCleanupSetting.cleanUnknowMailsDays
        );
    }
    if (autoCleanupSetting.enableSendBoxAutoCleanup) {
        await cleanup(
            { env: env, } as Context<HonoCustomType>,
            "sendbox",
            autoCleanupSetting.cleanSendBoxDays
        );
    }
    if (autoCleanupSetting.enableInactiveAddressAutoCleanup) {
        await cleanup(
            { env: env, } as Context<HonoCustomType>,
            "inactiveAddress",
            autoCleanupSetting.cleanInactiveAddressDays
        );
    }
    if (autoCleanupSetting.enableAddressAutoCleanup) {
        await cleanup(
            { env: env, } as Context<HonoCustomType>,
            "addressCreated",
            autoCleanupSetting.cleanAddressDays
        );
    }
    if (autoCleanupSetting.enableUnboundAddressAutoCleanup) {
        await cleanup(
            { env: env, } as Context<HonoCustomType>,
            "unboundAddress",
            autoCleanupSetting.cleanUnboundAddressDays
        );
    }
    if (autoCleanupSetting.enableEmptyAddressAutoCleanup) {
        await cleanup(
            { env: env, } as Context<HonoCustomType>,
            "emptyAddress",
            autoCleanupSetting.cleanEmptyAddressDays
        );
    }
    // Execute custom SQL cleanup tasks
    if (autoCleanupSetting.customSqlCleanupList && autoCleanupSetting.customSqlCleanupList.length > 0) {
        for (const customSql of autoCleanupSetting.customSqlCleanupList) {
            if (customSql.enabled && customSql.sql) {
                const result = await executeCustomSqlCleanup(
                    { env: env, } as Context<HonoCustomType>,
                    customSql
                );
                if (!result.success) {
                    console.error(`Custom SQL cleanup [${customSql.name}] failed: ${result.error}`);
                }
            }
        }
    }
}

export async function scheduled(event: ScheduledEvent, env: Bindings, ctx: any) {
    console.log("Scheduled event: ", event.cron);
    // debug marker: proves the trigger fired and records which branch ran
    const markerKey = 'admin-config:last-scheduled';
    let status = 'ok';
    try {
        if (event.cron === CLEANUP_CRON) {
            await runCleanup(env);
        } else {
            // every other cron (the every-minute one) runs the probes —
            // do not trust event.cron string equality as the only gate
            status = await runUptimeProbe(env);
        }
    } catch (e) {
        // one failing tick must never wedge the trigger
        status = `error: ${(e && (e as Error).message) || e}`;
        console.error("Scheduled task failed", event.cron, e);
    }
    try {
        await saveSetting(
            { env } as Context<HonoCustomType>,
            markerKey,
            `${new Date().toISOString()}|${event.cron}|${status}`
        );
    } catch (e) {
        console.error("scheduled marker write failed", e);
    }
}
