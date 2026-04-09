const deploymentList = document.querySelector("#deployment-list");
const year = document.querySelector("#year");

const deploymentChecklist = [
	"Choose a static host such as Vercel or Netlify.",
	"Add your production domain and DNS records.",
	"Verify that links, images, and metadata still work after deployment.",
];

for (const item of deploymentChecklist) {
	const li = document.createElement("li");
	li.textContent = item;
	deploymentList?.appendChild(li);
}

if (year) {
	year.textContent = `Updated ${new Date().getFullYear()}`;
}

