// index.js
import { Client, GatewayIntentBits, ActionRowBuilder, StringSelectMenuBuilder, SlashCommandBuilder, TextInputBuilder, TextInputStyle, ModalBuilder, PermissionsBitField } from 'discord.js';
import schedule from 'node-schedule';
import fs from 'fs';

const client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers] });
const LOG_CHANNEL_ID = '1483219896069525665';
const PREFIX = '/';

const warningsData = {
  verbal: { id: "1523525037162893373", name: "انذار شفهي", duration: 3 }, // أيام
  warn1: { id: "1523519282707828756", name: "انذار أول", duration: 14 }, // أيام
  warn2: { id: "1523519193314758758", name: "انذار ثاني", duration: 30 }, // أيام
  warn3: { id: "1523519440451272794", name: "انذار ثالث", duration: 45 }, // أيام
  block: { id: "1523519407379189890", name: "مستبعد من التقسيمة", duration: null },
  black: { id: "1498706382587822191", name: "بلاك ليست", duration: null },
  test: { id: null, name: "تجربة", duration: 1/1440 } // 1 دقيقة
};

let userWarnings = {}; // حفظ الإنذارات: { userId: { type, end } }

client.on('ready', () => {
  console.log(`Logged in as ${client.user.tag}`);
});

client.on('interactionCreate', async (interaction) => {
  if (!interaction.isCommand()) return;

  const { commandName, options } = interaction;

  // إعطاء عقوبة
  if (commandName === 'انذار') {
    const user = options.getUser('المستخدم');
    const warningType = options.getString('نوع_العقوبة');
    const reason = options.getString('السبب');

    const warning = warningsData[warningType];
    if (!warning) return;

    let durationDays = warning.duration;
    // إذا مدتها موجودة (ليس مستبعد/بلاك ليست) حول للأيام
    let endTime = null;
    if (durationDays) {
      const now = new Date();
      endTime = new Date(now.getTime() + durationDays * 24 * 60 * 60 * 1000);
      // جدول لإزالة الإنذار بعد انتهائه
      schedule.scheduleJob(endTime, () => {
        delete userWarnings[user.id];
      });
    }

    userWarnings[user.id] = { type: warningType, end: endTime };

    // إضافة الرول إذا موجودة
    if (warning.id) {
      const guild = interaction.guild;
      const member = await guild.members.fetch(user.id);
      const role = guild.roles.cache.get(warning.id);
      if (role) member.roles.add(role).catch(console.error);
    }

    // إرسال اللوق
    const logChannel = await client.channels.fetch(LOG_CHANNEL_ID);
    let durationText = durationDays ? `${durationDays} يوم` : 'دائم';
    logChannel.send({
      content: `🚨 تم إعطاء عقوبة
المستخدم: <@${user.id}>
الإداري: <@${interaction.user.id}>
العقوبة: ${warning.name}
المدة: ${durationText}
السبب: ${reason}`
    });

    await interaction.reply({ content: 'تم تسجيل العقوبة', ephemeral: true });
  }

  // فحص الأشخاص اللي عليهم إنذارات
  if (commandName === 'فحص') {
    let replyText = '⚠️ الأشخاص اللي عليهم إنذارات:\n';
    const now = new Date();
    for (const [userId, data] of Object.entries(userWarnings)) {
      let remaining = data.end ? Math.ceil((data.end - now)/(1000*60*60*24)) : 'دائم';
      replyText += `<@${userId}> - ${warningsData[data.type].name} - المتبقي: ${remaining} يوم\n`;
    }
    await interaction.reply({ content: replyText || 'لا يوجد أشخاص عليهم إنذارات', ephemeral: false });
  }
});

// تسجيل أوامر سلاش
client.on('ready', async () => {
  const guild = client.guilds.cache.first();
  await guild.commands.set([
    new SlashCommandBuilder()
      .setName('انذار')
      .setDescription('إعطاء عقوبة')
      .addUserOption(option => option.setName('المستخدم').setDescription('المستخدم').setRequired(true))
      .addStringOption(option => option.setName('نوع_العقوبة').setDescription('اختر نوع العقوبة').setRequired(true).addChoices(
        { name: 'انذار شفهي', value: 'verbal' },
        { name: 'انذار أول', value: 'warn1' },
        { name: 'انذار ثاني', value: 'warn2' },
        { name: 'انذار ثالث', value: 'warn3' },
        { name: 'مستبعد من التقسيمة', value: 'block' },
        { name: 'بلاك ليست', value: 'black' },
        { name: 'تجربة', value: 'test' }
      ))
      .addStringOption(option => option.setName('السبب').setDescription('اكتب السبب').setRequired(true)),
    new SlashCommandBuilder()
      .setName('فحص')
      .setDescription('يعرض الأشخاص اللي عليهم إنذارات')
  ]);
});

client.login(process.env.TOKEN);
