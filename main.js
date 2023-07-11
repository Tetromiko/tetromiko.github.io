var prevScrollPos = window.scrollY;
var header = document.getElementsByClassName("fixed-header")[0];

window.onscroll = function () {
  var currentScrollPos = window.scrollY;

  if (prevScrollPos > currentScrollPos) {
    header.classList.add("show");
    header.classList.remove("hide");
  } else {
    header.classList.add("hide");
    header.classList.remove("show");
  }

  prevScrollPos = currentScrollPos;
};

function loadJSON(file, callback) {
  var xhr = new XMLHttpRequest();
  xhr.overrideMimeType("application/json");
  xhr.open("GET", file, true);
  xhr.onreadystatechange = function () {
    if (xhr.readyState === 4 && xhr.status === 200) {
      callback(JSON.parse(xhr.responseText));
    }
  };
  xhr.send(null);
}
loadJSON("data.json", function (data) {
  document.getElementById("about-text").innerText = data.about;
  document.getElementById("full-name").innerText = data.fullName;

  var hardSkillsCategories = document.getElementById("categories");

  data.hardSkills.forEach(function (category) {
    var skillCategory = document.createElement("div");
    skillCategory.classList.add("category");
    var categoryName = document.createElement("h3");
    categoryName.classList.add("category-name");
    var categorySkills = document.createElement("div");
    categorySkills.classList.add("category-skills");
    categoryName.innerText = category.category;
    hardSkillsCategories.appendChild(skillCategory);
    skillCategory.appendChild(categoryName);
    skillCategory.appendChild(categorySkills);

    category.skills.forEach(function (skill) {
      var hardSkill = document.createElement("div");
      hardSkill.classList.add("skill");
      var hardSkillName = document.createElement("div");
      hardSkillName.classList.add("skill-name");
      hardSkillName.innerText = skill.name;

      var hardSkillLevel = document.createElement("div");
      hardSkillLevel.classList.add("skill-level");
      hardSkill.appendChild(hardSkillName);
      hardSkill.appendChild(hardSkillLevel);
      categorySkills.appendChild(hardSkill);
      for (let i = 0; i < skill.level; i++) {
        var levelCircle = document.createElement("div");
        levelCircle.classList.add("level-circle");
        levelCircle.classList.add("active");
        hardSkillLevel.appendChild(levelCircle);
      }
      for (let i = 0; i < 5 - skill.level; i++) {
        var levelCircle = document.createElement("div");
        levelCircle.classList.add("level-circle");
        levelCircle.classList.add("inactive");
        hardSkillLevel.appendChild(levelCircle);
      }
    });
  });

  var softSkillsList = document.getElementById("soft-skills-list");
  data.softSkills.forEach(function (skill) {
    var softSkillItem = document.createElement("li");
    softSkillItem.innerText = skill;
    softSkillsList.appendChild(softSkillItem);
  });

  var educationList = document.getElementById("education-list");
  data.education.forEach(function (edu) {
    var eduItem = document.createElement("li");
    eduItem.innerHTML = `<strong>${edu.institution}</strong> - ${edu.degree} (${edu.startDate} - ${edu.endDate})`;
    educationList.appendChild(eduItem);
  });

  var contactList = document.getElementById("contact-list");
  var contactSocial = document.getElementById("contact-social");

  var telegramLink = document.createElement("a");
  telegramLink.setAttribute("href", data.contact.telegram);
  var githubLink = document.createElement("a");
  githubLink.setAttribute("href", data.contact.github);
  var telegramItem = document.createElement("img");
  telegramItem.setAttribute("draggable", "false");
  telegramItem.setAttribute("src", "telegram.svg");
  var githubItem = document.createElement("img");
  githubItem.setAttribute("draggable", "false");
  githubItem.setAttribute("src", "github.svg");
  var emailItem = document.createElement("li");
  emailItem.innerText = `Email: ${data.contact.email}`;
  var phoneItem = document.createElement("li");
  phoneItem.innerText = `Phone: ${data.contact.phone}`;
  contactSocial.appendChild(telegramLink);
  telegramLink.appendChild(telegramItem);
  contactSocial.appendChild(githubLink);
  githubLink.appendChild(githubItem);
  contactList.appendChild(emailItem);
  contactList.appendChild(phoneItem);
});
