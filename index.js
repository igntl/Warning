const { Client, GatewayIntentBits, ActionRowBuilder, StringSelectMenuBuilder, SlashCommandBuilder, ModalBuilder, TextInputBuilder, TextInputStyle, EmbedBuilder, PermissionsBitField } = require('discord.js');
const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers]
});

const TOKEN = process.env.TOKEN;

// 📌 IDs
const LOG_CHANNEL = "1490286354175758366";
const SOURCE_CHANNEL = "1483219896069525665";
const ALLOWED_ROLES = ["1523520246097514528"]; // مسؤولين الشكاوي

// ⚡ الإنذارات والرتب
const ROLES = {
  verbal: { id: "1523525037162893373", name: "انذار شفهي", duration: 3 * 24 * 60 * 60 * 1000 },
  warn1: { id: "1523519282707828756", name: "انذار أول", duration: 14 * 24 * 60 * 60 * 1000 },
  warn2: { id: "1523519193314758758", name: "انذار ثاني", duration: 30 * 24 * 60 * 60 * 1000 },
  warn3: { id: "1523519440451272794", name: "انذار ثالث", duration: 45 * 24 * 60 * 60 * 1000 },
  block: { id: "1523519407379189890", name: "مستبعد من التقسيمة", duration: null },
  black: { id: "1498706382587822191", name: "بلاك ليست", duration: null },
  test: { id: null, name: "تجربة", duration: 60 * 1000 } // دقيقة تجربة
};

const temp = new Map();

client.once("ready", async () => {
  console.log("Bot Ready");

  const cmd = new SlashCommandBuilder()
    .setName("انذارات")
    .setDescription("لوحة الإنذارات")
    .addUserOption(o => o.setName("الشخص").setDescription("اختر الشخص").setRequired(true));

  await client.application.commands.set([cmd]);
});

client.on("interactionCreate", async (interaction) => {
  if (interaction.isChatInputCommand()) {
    if (!ALLOWED_ROLES.some(r => interaction.member.roles.cache.has(r))) {
      return interaction.reply({ content: "❌ ما عندك صلاحية", ephemeral: true });
    }

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
      content: "اختر العقوبة:",
      components: [new ActionRowBuilder().addComponents(menu)],
      ephemeral: true
    });
  }

  if (interaction.isStringSelectMenu() && interaction.customId === "types") {
    const data = temp.get(interaction.user.id);
    data.types = interaction.values;

    const requiresDuration = data.types.some(t => ["block", "black"].includes(t));
    if (requiresDuration) {
      const durationMenu = new StringSelectMenuBuilder()
        .setCustomId("duration")
        .setPlaceholder("اختر المدة")
        .addOptions([
          { label: "تجربة", value: "test" },
          { label: "دائم", value: "permanent" }
        ]);
      return interaction.update({ content: "اختر المدة:", components: [new ActionRowBuilder().addComponents(durationMenu)] });
    } else {
      const modal = new ModalBuilder().setCustomId("reasonModal").setTitle("سبب العقوبة");
      const input = new TextInputBuilder().setCustomId("reason").setLabel("اكتب السبب").setStyle(TextInputStyle.Paragraph).setRequired(true);
      modal.addComponents(new ActionRowBuilder().addComponents(input));
      return interaction.showModal(modal);
    }
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

      const duration = ROLES[t].duration || (ROLES[data.duration]?.duration || null);
      if (duration) {
        setTimeout(async () => {
          const role = interaction.guild.roles.cache.get(ROLES[t].id);
          if (role && member.roles.cache.has(role.id)) await member.roles.remove(role);

          // حذف اللوق بعد انتهاء المدة
          const logChannel = interaction.guild.channels.cache.get(LOG_CHANNEL);
          if (logChannel) {
            const messages = await logChannel.messages.fetch({ limit: 100 });
            messages.filter(m => m.embeds.length > 0 && m.embeds[0].fields.some(f => f.value.includes(`<@${member.id}>`)))
                    .forEach(m => m.delete().catch(() => {}));
          }
        }, duration);
      }
    }

    const punishNames = data.types.map(t => ROLES[t].name).join(" + ");
    const durationsText = data.types.map(t => {
      if (ROLES[t].duration) return msToString(ROLES[t].duration);
      if (ROLES[data.duration]?.duration) return msToString(ROLES[data.duration].duration);
      return "دائم";
    }).join(" + ");

    const embed = new EmbedBuilder()
      .setTitle("🚨 تم إعطاء عقوبة")
      .setColor(0xFF4C4C)
      .addFields(
        { name: "👤 المستخدم", value: `<@${member.id}>`, inline: true },
        { name: "👮 الإداري", value: `<@${interaction.user.id}>`, inline: true },
        { name: "📋 العقوبات", value: punishNames },
        { name: "⏱ المدة", value: durationsText },
        { name: "📝 السبب", value: reason }
      )
      .setTimestamp();

    const log = interaction.guild.channels.cache.get(LOG_CHANNEL);
    if (log) log.send({ embeds: [embed] });

    await interaction.editReply({ content: "✅ تم تنفيذ العقوبة" });
    temp.delete(interaction.user.id);
  }
});

// تحويل المدة من ملي ثانية لنص عربي
function msToString(ms) {
  const days = Math.floor(ms / (24*60*60*1000));
  const hours = Math.floor((ms % (24*60*60*1000))/(60*60*1000));
  const minutes = Math.floor((ms % (60*60*1000))/(60*1000));
  let str = "";
  if(days) str += `${days} يوم `;
  if(hours) str += `${hours} ساعة `;
  if(minutes) str += `${minutes} دقيقة`;
  return str.trim() || "دقيقة";
}

client.login(TOKEN);
