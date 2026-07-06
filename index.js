const { Client, GatewayIntentBits, ActionRowBuilder, StringSelectMenuBuilder, SlashCommandBuilder, ModalBuilder, TextInputBuilder, TextInputStyle, EmbedBuilder, PermissionsBitField } = require('discord.js');
const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers]
});

const TOKEN = process.env.TOKEN;

// 📌 IDs
const LOG_CHANNEL = "1490286354175758366";
const ALLOWED_ROLES = ["1523520246097514528"];
const WORK_CHANNEL = "1483219896069525665";

// ⚡ الإنذارات والرتب
const ROLES = {
  verbal: { id: "1523525037162893373", name: "انذار شفهي", duration: 3 * 24 * 60 * 60 * 1000 },
  warn1: { id: "1523519282707828756", name: "انذار أول", duration: 14 * 24 * 60 * 60 * 1000 },
  warn2: { id: "1523519193314758758", name: "انذار ثاني", duration: 30 * 24 * 60 * 60 * 1000 },
  warn3: { id: "1523519440451272794", name: "انذار ثالث", duration: 45 * 24 * 60 * 60 * 1000 },
  block: { id: "1523519407379189890", name: "مستبعد من التقسيمة", duration: null },
  black: { id: "1498706382587822191", name: "بلاك ليست", duration: null },
  test: { id: null, name: "تجربة", duration: 60 * 1000 } // دقيقة واحدة تجربة
};

const temp = new Map();

function msToTime(ms) {
  if (!ms) return "دائم";
  let totalSec = Math.floor(ms / 1000);
  const days = Math.floor(totalSec / 86400);
  totalSec %= 86400;
  const hours = Math.floor(totalSec / 3600);
  totalSec %= 3600;
  const minutes = Math.floor(totalSec / 60);
  return `${days > 0 ? days + " يوم " : ""}${hours > 0 ? hours + " س " : ""}${minutes > 0 ? minutes + " د " : ""}`.trim() || "1 دقيقة";
}

client.once("ready", async () => {
  console.log("Bot Ready");

  const cmd = new SlashCommandBuilder()
    .setName("انذارات")
    .setDescription("لوحة الانذارات")
    .addUserOption(o => o.setName("الشخص").setDescription("اختر الشخص").setRequired(true));

  await client.application.commands.set([cmd]);
});

client.on("interactionCreate", async (interaction) => {
  if (interaction.channel.id !== WORK_CHANNEL) return;

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
        { label: "بلاك ليست", value: "black" }
      ]);

    return interaction.reply({
      content: "اختر العقوبات:",
      components: [new ActionRowBuilder().addComponents(menu)],
      ephemeral: true
    });
  }

  if (interaction.isStringSelectMenu() && interaction.customId === "types") {
    const data = temp.get(interaction.user.id);
    data.types = interaction.values;

    const needsDuration = data.types.some(t => t === "block" || t === "black");
    if (needsDuration) {
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

    // إذا الانذارات العادية، ننتقل للسبب مباشرة
    const modal = new ModalBuilder().setCustomId("reasonModal").setTitle("سبب العقوبة");
    const input = new TextInputBuilder().setCustomId("reason").setLabel("اكتب السبب").setStyle(TextInputStyle.Paragraph).setRequired(true);
    modal.addComponents(new ActionRowBuilder().addComponents(input));
    return interaction.showModal(modal);
  }

  if (interaction.isStringSelectMenu() && interaction.customId === "duration") {
    const data = temp.get(interaction.user.id);
    data.duration = interaction.values[0];

    const modal = new ModalBuilder().setCustomId("reasonModal").setTitle("سبب العقوبة");
    const input = new TextInputBuilder().setCustomId("reason").setLabel("اكتب السبب").setStyle(TextInputStyle.Paragraph).setRequired(true);
    modal.addComponents(new ActionRowBuilder().addComponents(input));
    return interaction.showModal(modal);
  }

  if (interaction.isModalSubmit() && interaction.customId === "reasonModal") {
    await interaction.deferReply({ ephemeral: true });

    const data = temp.get(interaction.user.id);
    const reason = interaction.fields.getTextInputValue("reason");
    const member = await interaction.guild.members.fetch(data.target);

    for (const t of data.types) {
      const role = interaction.guild.roles.cache.get(ROLES[t].id);
      await member.roles.add(role);

      // مدة العقوبة
      let duration = ROLES[t].duration;
      if ((t === "block" || t === "black") && data.duration) {
        duration = ROLES[data.duration]?.duration || duration;
      }

      if (duration) {
        setTimeout(async () => {
          const r = interaction.guild.roles.cache.get(ROLES[t].id);
          if (r && member.roles.cache.has(r.id)) await member.roles.remove(r);

          // إزالة اللوق بعد انتهاء المدة
          const log = interaction.guild.channels.cache.get(LOG_CHANNEL);
          if (log) {
            const messages = await log.messages.fetch({ limit: 100 });
            messages.forEach(msg => {
              if (msg.embeds.length > 0) {
                const e = msg.embeds[0];
                if (e.fields[0].value.includes(member.id)) {
                  msg.delete().catch(() => {});
                }
              }
            });
          }
        }, duration);
      }
    }

    // إنشاء لوق واضح مع المدة
    const punishDetails = data.types.map(t => {
      let durationText = "دائم";
      if (ROLES[t].duration) durationText = msToTime(ROLES[t].duration);
      if ((t === "block" || t === "black") && data.duration) {
        const d = ROLES[data.duration]?.duration || 0;
        durationText = msToTime(d);
      }
      return { name: ROLES[t].name, duration: durationText };
    });

    const embed = new EmbedBuilder()
      .setTitle("🚨 تم إعطاء عقوبة")
      .setColor(0xFF4C4C)
      .addFields(
        { name: "👤 المستخدم", value: `<@${member.id}>`, inline: true },
        { name: "👮 الإداري", value: `<@${interaction.user.id}>`, inline: true },
        { name: "📋 العقوبات", value: punishDetails.map(p => p.name).join("\n"), inline: true },
        { name: "⏱️ المدة", value: punishDetails.map(p => p.duration).join("\n"), inline: true },
        { name: "📝 السبب", value: reason, inline: false }
      )
      .setTimestamp();

    const log = interaction.guild.channels.cache.get(LOG_CHANNEL);
    if (log) log.send({ embeds: [embed] });

    await interaction.editReply({ content: "✅ تم تنفيذ العقوبة" });
    temp.delete(interaction.user.id);
  }
});

client.login(TOKEN);
