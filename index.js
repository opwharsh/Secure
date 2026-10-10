require('dotenv').config();
const {
  Client, GatewayIntentBits, Partials, ActivityType, SlashCommandBuilder,
  REST, Routes, PermissionFlagsBits, EmbedBuilder, ChannelType,
} = require('discord.js');

const token = process.env.DISCORD_TOKEN;
let targetChannelId = process.env.TARGET_CHANNEL_ID || null;
const guildId = process.env.GUILD_ID;
const intervalSeconds = Math.max(15, Number.parseInt(process.env.STATUS_INTERVAL_SECONDS || '30', 10) || 30);
if (!token) { console.error('Missing DISCORD_TOKEN.'); process.exit(1); }

const statuses = [
  { name: 'Securing server /marvelboost', type: ActivityType.Watching },
  { name: 'Monitoring 2340 members', type: ActivityType.Watching },
];

const HINGLISH_WORDS = new Set([
  'hai','hain','hoon','hu','hun','tha','thi','the','nahi','nhi','nahin','haan','han','kya','kyu','kyun','kaise','kaisa','kaisi','kab','kahan','kidhar','kaun','kon','mera','meri','mere','tera','teri','tere','tum','tumhara','tumhari','aap','apka','apni','apne','mujhe','mujhko','tujhe','isko','usko','hum','ham','hamara','apna','unka','unki','kar','karo','kare','karen','kardo','krdo','kr','krna','karna','karke','bata','batao','batado','bol','bolo','bola','bolna','de','do','dedo','le','lelo','liye','chahiye','chahie','matlab','bhai','yaar','acha','accha','achha','abhi','phir','fir','kyunki','toh','to','aur','par','lekin','magar','bas','bohot','bahut','thoda','zyada','wala','wali','wale','sab','kuch','koi','mat','raha','rahi','rahe','gaya','gayi','gaye','jao','jana','aana','aa','gya','gyi','scene','pata','padh','dekh','dekho','sun','suno','samajh','samjha','samjho','milega','mila','milta','milti','krde','bta','btao','mtlb','kese','konsa','konsi','kitna','kitni','kitne','ab','kal','aaj'
]);
const STRONG_HINGLISH = new Set(['mujhe','tumhe','tujhe','bhai','yaar','kardo','krdo','batao','batado','nahi','nhi','hain','hoon','kaise','kyun','kyu','kya','tera','meri','matlab','raha','rahi','rahe','chahiye','btao','krna','karna']);
function normalizeMessage(content) {
  return content.toLowerCase().replace(/https?:\/\/\S+/g, ' ').replace(/<@!?\d+>|<@&\d+>|<#\d+>/g, ' ').replace(/[^a-z\s']/g, ' ').replace(/\s+/g, ' ').trim();
}
function detectHinglish(content) {
  const normalized = normalizeMessage(content);
  if (!normalized) return { detected: false, matches: [] };
  const words = normalized.split(' ');
  const matches = [...new Set(words.filter(word => HINGLISH_WORDS.has(word)))];
  const strongMatches = matches.filter(word => STRONG_HINGLISH.has(word));
  return { detected: strongMatches.length >= 2 || (strongMatches.length >= 1 && matches.length >= 2) || matches.length >= 3, matches };
}
function warningEmbed(reason = 'Your message was removed because it appears to contain Hinglish or Roman Hindi.') {
  return new EmbedBuilder().setColor(0xe67e22).setTitle('Language Warning')
    .setDescription(`${reason}\n\nPlease use English or French in this channel.`)
    .addFields({ name: 'Please note', value: 'Automated detection may occasionally be incorrect. Contact a moderator if you believe this was a mistake.' })
    .setTimestamp();
}
async function sendChannelWarning(channel, userId, reason) {
  return channel.send({ content: `<@${userId}>`, embeds: [warningEmbed(reason)], allowedMentions: { users: [userId] } });
}
async function moderateMessage(message, { force = false } = {}) {
  if (!message || !message.guild || message.author?.bot || message.channelId !== targetChannelId) return { skipped: true };
  const result = detectHinglish(message.content || '');
  if (!force && !result.detected) return { skipped: true, detected: false };
  try {
    await message.delete();
  } catch (error) {
    console.error(`Could not delete message ${message.id}:`, error.message);
    return { deleted: false, error: error.message };
  }
  try {
    await sendChannelWarning(message.channel, message.author.id, force
      ? 'A moderator manually flagged your message for a language-rule violation.'
      : 'Your message was removed because it appears to contain Hinglish or Roman Hindi.');
  } catch (error) { console.error('Could not send channel warning:', error.message); }
  console.log(`Removed message ${message.id} by ${message.author.tag}; manual=${force}; matches=${result.matches.join(', ')}`);
  return { deleted: true, detected: result.detected, matches: result.matches };
}

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent],
  partials: [Partials.Channel, Partials.Message],
});
const commandData = [
  new SlashCommandBuilder().setName('languageguard').setDescription('Check language guard configuration').setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),
  new SlashCommandBuilder().setName('set-channel').setDescription('Set the channel where Hinglish moderation runs').setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addChannelOption(option => option.setName('channel').setDescription('Channel to moderate').addChannelTypes(ChannelType.GuildText).setRequired(true)),
  new SlashCommandBuilder().setName('refresh').setDescription('Scan recent messages in the configured channel and remove likely Hinglish').setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
    .addIntegerOption(option => option.setName('limit').setDescription('How many recent messages to scan (1–100, default 50)').setMinValue(1).setMaxValue(100).setRequired(false)),
  new SlashCommandBuilder().setName('manual-detection').setDescription('Manually remove a message by its Discord message link and warn its author').setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
    .addStringOption(option => option.setName('message_link').setDescription('Link to the message to remove').setRequired(true)),
].map(command => command.toJSON());

async function registerCommands() {
  try {
    const rest = new REST({ version: '10' }).setToken(token);
    if (guildId && /^\d{17,20}$/.test(guildId)) {
      await rest.put(Routes.applicationGuildCommands(client.user.id, guildId), { body: commandData });
      console.log(`Registered guild slash commands in ${guildId}.`);
    } else {
      await rest.put(Routes.applicationCommands(client.user.id), { body: commandData });
      console.log('Registered global slash commands (may take time to appear).');
    }
  } catch (error) { console.error('Slash command registration failed:', error.message); }
}
client.once('ready', async () => {
  console.log(`Logged in as ${client.user.tag}`);
  await registerCommands();
  let index = 0;
  client.user.setPresence({ activities: [statuses[index]], status: 'online' });
  setInterval(() => {
    index = (index + 1) % statuses.length;
    client.user.setPresence({ activities: [statuses[index]], status: 'online' });
  }, intervalSeconds * 1000);
});

client.on('interactionCreate', async interaction => {
  if (!interaction.isChatInputCommand()) return;
  if (interaction.commandName === 'set-channel') {
    if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) {
      return interaction.reply({ content: 'You need Manage Server permission to set the moderation channel.', ephemeral: true });
    }
    const selectedChannel = interaction.options.getChannel('channel', true);
    targetChannelId = selectedChannel.id;
    return interaction.reply({ content: `Language moderation channel set to ${selectedChannel}. New messages and moderation commands will use this channel. This setting is currently runtime-only and may reset when the bot restarts; set TARGET_CHANNEL_ID in Railway Variables as well if you want it as the startup default.`, ephemeral: true });
  }
  if (interaction.commandName === 'languageguard') {
    const embed = new EmbedBuilder().setColor(0xe74c3c).setTitle('Language Guard Status').addFields(
      { name: 'Moderation channel', value: targetChannelId ? `<#${targetChannelId}>` : 'Not set — use `/set-channel`', inline: true },
      { name: 'Warning delivery', value: 'Same channel with a user ping', inline: true },
      { name: 'Detection', value: 'Roman-Hindi/Hinglish word heuristic', inline: false },
      { name: 'Commands', value: '`/languageguard`, `/set-channel`, `/refresh`, `/manual-detection`', inline: false },
      { name: 'Rotating presence', value: 'Securing server /marvelboost\nMonitoring 2340 members', inline: false },
    ).setFooter({ text: 'Detection is heuristic and can occasionally be incorrect.' });
    return interaction.reply({ embeds: [embed], ephemeral: true });
  }
  if (!targetChannelId) {
    return interaction.reply({ content: 'No moderation channel is configured. Use `/set-channel` first, or set TARGET_CHANNEL_ID in Railway Variables.', ephemeral: true });
  }
  if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageMessages)) {
    return interaction.reply({ content: 'You need Manage Messages permission to use this command.', ephemeral: true });
  }
  if (interaction.commandName === 'refresh') {
    await interaction.deferReply({ ephemeral: true });
    const limit = interaction.options.getInteger('limit') || 50;
    const channel = await client.channels.fetch(targetChannelId).catch(() => null);
    if (!channel?.isTextBased() || !channel.messages) return interaction.editReply('Configured target channel could not be accessed. Check the channel ID and bot permissions.');
    let before;
    let scanned = 0, removed = 0, failed = 0;
    try {
      while (scanned < limit) {
        const batch = await channel.messages.fetch({ limit: Math.min(100, limit - scanned), ...(before ? { before } : {}) });
        if (!batch.size) break;
        const messages = [...batch.values()].sort((a, b) => a.createdTimestamp - b.createdTimestamp);
        before = batch.last()?.id;
        for (const message of messages) {
          scanned++;
          const result = await moderateMessage(message);
          if (result.deleted) removed++;
          else if (result.error) failed++;
          if (scanned >= limit) break;
        }
        if (batch.size < Math.min(100, limit - (scanned - batch.size))) break;
      }
      return interaction.editReply(`Refresh complete in <#${targetChannelId}>. Scanned: ${scanned}. Removed and warned: ${removed}. Could not delete: ${failed}. Messages that did not match the detector were left untouched.`);
    } catch (error) {
      console.error('Refresh failed:', error);
      return interaction.editReply(`Refresh failed: ${error.message}. Check bot channel/history permissions.`);
    }
  }
  if (interaction.commandName === 'manual-detection') {
    await interaction.deferReply({ ephemeral: true });
    const link = interaction.options.getString('message_link', true).trim();
    const match = link.match(/discord(?:app)?\.com\/channels\/(\d{17,20})\/(\d{17,20})\/(\d{17,20})/i);
    if (!match) return interaction.editReply('That does not look like a valid Discord message link. Copy Message Link and try again.');
    const [, linkedGuildId, channelId, messageId] = match;
    if (interaction.guildId !== linkedGuildId) return interaction.editReply('The linked message must be from this server.');
    if (channelId !== targetChannelId) return interaction.editReply(`Manual detection is restricted to the configured channel <#${targetChannelId}>.`);
    const channel = await client.channels.fetch(channelId).catch(() => null);
    if (!channel?.isTextBased() || !channel.messages) return interaction.editReply('Could not access that channel.');
    const message = await channel.messages.fetch(messageId).catch(() => null);
    if (!message) return interaction.editReply('Message not found. It may already be deleted, or the bot cannot access it.');
    if (message.author.bot) return interaction.editReply('Bot messages are not moderated by this command.');
    const result = await moderateMessage(message, { force: true });
    if (!result.deleted) return interaction.editReply(`Could not delete the message. Check Manage Messages permission. ${result.error || ''}`);
    return interaction.editReply(`Manually flagged message deleted and a channel warning was sent to <@${message.author.id}>.`);
  }
});

client.on('messageCreate', async message => {
  if (!targetChannelId) return;
  if (!message.guild || message.author.bot || message.channelId !== targetChannelId) return;
  if (message.content.startsWith('/') || message.content.startsWith('!')) return;
  await moderateMessage(message);
});
client.on('error', error => console.error('Discord client error:', error));
process.on('unhandledRejection', error => console.error('Unhandled rejection:', error));
client.login(token);
