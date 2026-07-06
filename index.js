const { Client, GatewayIntentBits, ActionRowBuilder, StringSelectMenuBuilder, SlashCommandBuilder, ModalBuilder, TextInputBuilder, TextInputStyle, EmbedBuilder, PermissionsBitField } = require('discord.js');
const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers]
});

const TOKEN = process.env.TOKEN;

// 📌 IDs
const LOG_CHANNEL = "1490286354175758366"; // روم اللوق
const ALLOWED_ROLES = ["1523520246097514528"]; // مسؤولين الشكاوي فقط

// ⚡ الإنذارات والرتب
const ROLES = {
  verbal: { id: "1523525037162893373", name: "انذار شفهي", duration: 3 * 24 * 60 * 60 * 1000 }, // 3 أيام
  warn1: { id: "1523519282707828756", name: "انذار أول", duration: 14 * 24 * 60 * 60 * 1000 }, // أسبوعين
  warn2: { id: "1523519193314758758", name: "انذار ثاني", duration: 30 * 24 * 60 * 60 * 1000 }, // شهر
  warn3: { id: "1523519440451272794", name: "انذار ثالث", duration: 45 * 24 * 60 * 60 * 1000 }, // شهر ونصف
  block: { id: "1523519407379189890", name: "مستبعد من التقسيمة", duration: null },
  black: { id: "1498706382587822191", name: "بلاك ليست", duration: null }
};

// ⏱️ المدد الاختيارية للبلاك/منع/تجربة
const DURATIONS = {
  test: { label: "تجربة", time: 60 * 1000 }, // دقيقة
  day: { label: "يوم", time: 24 * 60 * 60 * 1000 },
  week: { label: "اسبوع", time: 7 * 24 * 60 * 60 * 1000 },
  permanent: { label: "دائم", time: null }
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

  // سلاش
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

    return interaction.reply({ content: "اختر العقوبات:", components: [new ActionRowBuilder().addComponents(menu)], ephemeral: true });
  }

  // اختيار العقوبة
  if (interaction.isStringSelectMenu() && interaction.customId === "types") {
    const data = temp.get(interaction.user.id);
    data.types = interaction.values;

    // إذا كان من الإنذارات ذات مدة ثابتة، ننتقل مباشرة للسبب
    const hasFixedDuration = data.types.some(t => ["verbal","warn1","warn2","warn3"].includes(t));
    if (hasFixedDuration) {
      const modal = new ModalBuilder().setCustomId("reasonModal").setTitle("سبب العقوبة");
      const input = new TextInputBuilder().setCustomId("reason").setLabel("اكتب السبب").setStyle(TextInputStyle.Paragraph).setRequired(true);
      modal.addComponents(new ActionRowBuilder().addComponents(input));
      return interaction.showModal(modal);
    }

    // للبلاك/منع أو تجربة
    const menu = new StringSelectMenuBuilder()
      .setCustomId("duration")
      .setPlaceholder("اختر المدة")
      .addOptions(Object.entries(DURATIONS).map(([k,v])=>({label:v.label,value:k})));

    return interaction.update({ content: "اختر المدة:", components: [new ActionRowBuilder().addComponents(menu)] });
  }

  // اختيار المدة للبلاك/منع
  if (interaction.isStringSelectMenu() && interaction.customId === "duration") {
    const data = temp.get(interaction.user.id);
    data.duration = interaction.values[0];

    const modal = new ModalBuilder().setCustomId("reasonModal").setTitle("سبب العقوبة");
    const input = new TextInputBuilder().setCustomId("reason").setLabel("اكتب السبب").setStyle(TextInputStyle.Paragraph).setRequired(true);
    modal.addComponents(new ActionRowBuilder().addComponents(input));
    return interaction.showModal(modal);
  }

  // بعد كتابة السبب
  if (interaction.isModalSubmit() && interaction.customId === "reasonModal") {
    await interaction.deferReply({ ephemeral: true });

    const data = temp.get(interaction.user.id);
    const reason = interaction.fields.getTextInputValue("reason");
    const member = await interaction.guild.members.fetch(data.target);

    for (const t of data.types) {
      const role = interaction.guild.roles.cache.get(ROLES[t].id);
      await member.roles.add(role);

      const duration = ROLES[t].duration || (DURATIONS[data.duration]?.time || null);
      if (duration) setTimeout(async () => {
        const role = interaction.guild.roles.cache.get(ROLES[t].id);
        if (role && member.roles.cache.has(role.id)) await member.roles.remove(role);

        // بعد انتهاء المدة احذف اللوق
        const logChannel = interaction.guild.channels.cache.get(LOG_CHANNEL);
        const messages = await logChannel.messages.fetch({ limit: 100 });
        const logMsg = messages.find(m=>m.embeds.length && m.embeds[0].fields.some(f=>f.value.includes(member.id)));
        if (logMsg) logMsg.delete().catch(()=>{});
      }, duration);
    }

    const punishNames = data.types.map(t => ROLES[t].name).join(" + ");
    const durationLabel = data.types.map(t=>ROLES[t].duration?`${ROLES[t].duration/(1000*60*60*24)} يوم`:(DURATIONS[data.duration]?.label||"")).join(" + ");

    const embed = new EmbedBuilder()
      .setTitle("🚨 تم إعطاء عقوبة")
      .setColor(0xFF4C4C)
      .addFields(
        { name: "👤 المستخدم", value: `<@${member.id}>`, inline: true },
        { name: "👮 الإداري", value: `<@${interaction.user.id}>`, inline: true },
        { name: "📋 العقوبات", value: punishNames },
        { name: "⏱️ المدة", value: durationLabel, inline:true },
        { name: "📝 السبب", value: reason }
      )
      .setTimestamp();

    const log = interaction.guild.channels.cache.get(LOG_CHANNEL);
    if (log) log.send({ embeds: [embed] });

    await interaction.editReply({ content: "✅ تم تنفيذ العقوبة" });
    temp.delete(interaction.user.id);
  }
});

client.login(TOKEN);
