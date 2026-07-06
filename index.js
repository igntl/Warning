import { Client, GatewayIntentBits, ActionRowBuilder, StringSelectMenuBuilder, SlashCommandBuilder, ModalBuilder, TextInputBuilder, TextInputStyle, EmbedBuilder, PermissionsBitField } from 'discord.js';
import schedule from 'node-schedule';

const TOKEN = process.env.TOKEN;

// 📌 IDs
const LOG_CHANNEL = "1490286354175758366";
const ALLOWED_ROLES = ["1523520246097514528"];
const ACTIVE_CHANNEL = "1483219896069525665";

// ⚡ الإنذارات والرتب
const ROLES = {
  verbal: { id: "1523525037162893373", name: "انذار شفهي", duration: 3 * 24 * 60 * 60 * 1000 },
  warn1: { id: "1523519282707828756", name: "انذار أول", duration: 14 * 24 * 60 * 60 * 1000 },
  warn2: { id: "1523519193314758758", name: "انذار ثاني", duration: 30 * 24 * 60 * 60 * 1000 },
  warn3: { id: "1523519440451272794", name: "انذار ثالث", duration: 45 * 24 * 60 * 60 * 1000 },
  block: { id: "1523519407379189890", name: "مستبعد من التقسيمة", duration: null },
  black: { id: "1498706382587822191", name: "بلاك ليست", duration: null },
  test: { id: null, name: "تجربة", duration: 1 * 60 * 1000 } // دقيقة
};

const temp = new Map();

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers]
});

client.once("ready", async () => {
  console.log("Bot Ready");

  const cmd = new SlashCommandBuilder()
    .setName("انذارات")
    .setDescription("لوحة الانذارات")
    .addUserOption(o => o.setName("الشخص").setDescription("اختر الشخص").setRequired(true));

  await client.application.commands.set([cmd]);
});

client.on("interactionCreate", async (interaction) => {
  if (interaction.channelId !== ACTIVE_CHANNEL) return;

  if (interaction.isChatInputCommand()) {
    const hasRole = interaction.member.roles.cache.some(r => ALLOWED_ROLES.includes(r.id));
    if (!hasRole) return interaction.reply({ content: "❌ ما عندك صلاحية", ephemeral: true });

    const user = interaction.options.getUser("الشخص");
    temp.set(interaction.user.id, { target: user.id });

    const menu = new StringSelectMenuBuilder()
      .setCustomId("types")
      .setPlaceholder("اختر العقوبة")
      .addOptions([
        { label: "انذار شفهي", value: "verbal" },
        { label: "انذار أول", value: "warn1" },
        { label: "انذار ثاني", value: "warn2" },
        { label: "انذار ثالث", value: "warn3" },
        { label: "مستبعد من التقسيمة", value: "block" },
        { label: "بلاك ليست", value: "black" },
        { label: "تجربة", value: "test" }
      ]);

    return interaction.reply({
      content: "اختر العقوبة:",
      components: [new ActionRowBuilder().addComponents(menu)],
      ephemeral: true
    });
  }

  if (interaction.isStringSelectMenu() && interaction.customId === "types") {
    const data = temp.get(interaction.user.id);
    data.type = interaction.values[0];

    // إذا الانذار أو تجربة، مباشرة استخدم مدته
    if (["verbal", "warn1", "warn2", "warn3", "test"].includes(data.type)) {
      data.duration = ROLES[data.type].duration;
      showReasonModal(interaction);
    } else {
      // البلاك ليست أو مستبعد يسمح باختيار المدة
      const menu = new StringSelectMenuBuilder()
        .setCustomId("duration")
        .setPlaceholder("اختر المدة")
        .addOptions([
          { label: "تجربة", value: "test" },
          { label: "يوم", value: "day" },
          { label: "اسبوع", value: "week" },
          { label: "دائم", value: "permanent" }
        ]);
      return interaction.update({ content: "اختر المدة:", components: [new ActionRowBuilder().addComponents(menu)] });
    }
  }

  if (interaction.isStringSelectMenu() && interaction.customId === "duration") {
    const data = temp.get(interaction.user.id);
    const val = interaction.values[0];
    if (val === "test") data.duration = ROLES.test.duration;
    else if (val === "day") data.duration = 24 * 60 * 60 * 1000;
    else if (val === "week") data.duration = 7 * 24 * 60 * 60 * 1000;
    else data.duration = null;
    showReasonModal(interaction);
  }

  if (interaction.isModalSubmit() && interaction.customId === "reasonModal") {
    await interaction.deferReply({ ephemeral: true });

    const data = temp.get(interaction.user.id);
    const reason = interaction.fields.getTextInputValue("reason");
    const member = await interaction.guild.members.fetch(data.target);
    const role = interaction.guild.roles.cache.get(ROLES[data.type].id);

    if (role) await member.roles.add(role);

    const embed = new EmbedBuilder()
      .setTitle("🚨 تم إعطاء عقوبة")
      .setColor(0xFF4C4C)
      .addFields(
        { name: "👤 المستخدم", value: `<@${member.id}>`, inline: true },
        { name: "👮 الإداري", value: `<@${interaction.user.id}>`, inline: true },
        { name: "📋 العقوبة", value: ROLES[data.type].name },
        { name: "⏱ المدة", value: data.duration ? `${data.duration / 1000 / 60} دقيقة` : "دائم" },
        { name: "📝 السبب", value: reason }
      )
      .setTimestamp();

    const log = interaction.guild.channels.cache.get(LOG_CHANNEL);
    const msg = log ? await log.send({ embeds: [embed] }) : null;

    // إزالة الرول واللوق بعد انتهاء المدة
    if (data.duration) {
      schedule.scheduleJob(Date.now() + data.duration, async () => {
        if (role && member.roles.cache.has(role.id)) await member.roles.remove(role);
        if (msg) msg.delete().catch(() => {});
      });
    }

    await interaction.editReply({ content: "✅ تم تنفيذ العقوبة" });
    temp.delete(interaction.user.id);
  }
});

function showReasonModal(interaction) {
  const modal = new ModalBuilder().setCustomId("reasonModal").setTitle("سبب العقوبة");
  const input = new TextInputBuilder().setCustomId("reason").setLabel("اكتب السبب").setStyle(TextInputStyle.Paragraph).setRequired(true);
  modal.addComponents(new ActionRowBuilder().addComponents(input));
  return interaction.showModal(modal);
}

client.login(TOKEN);
