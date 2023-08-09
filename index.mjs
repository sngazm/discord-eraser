import {
  Client,
  GatewayIntentBits
} from 'discord.js';
import { configDotenv } from 'dotenv';
import cron from 'node-cron';
import { handleChannelCreate, handleChannelUpdate, handleReady } from './handlers.mjs';

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.GuildModeration,
    GatewayIntentBits.MessageContent,
  ],
});
configDotenv();

client.once('ready', handleReady(client, cron));

client.on("channelUpdate", handleChannelUpdate);
client.on('channelCreate', handleChannelCreate);

client.login(process.env.DISCORD_BOT_TOKEN);

