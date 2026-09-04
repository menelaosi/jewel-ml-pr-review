// b/src/placements/complete-the-look.ts

import { getShopperEmail, getShopperId } from '../identity';

const STYLES = `{
	.jml-ctl {
		display: flex;

		gap: 12px;
		overflow-x: auto;
		scrollbar-width: thin;
	}
	
	.jml-ctl__item {
		flex: 0 0 160px;
	}
	
	img {
		max-width: 100%;
		height: auto;
		border-radius: 8px;
	}
	h3 {
		font-size: 14px;
		font-weight: 600;
		margin: 8px 0 4px;
	}
	p {
		font-size: 13px;
		color: #666;
	}
}`;

interface CatalogItem {
	sku: string;
	title: string;
	url: string;
	image: { url: string; alt: string };
	price: { formatted: string; amount: number };
	brand: string;
}

export function mountCompleteTheLook(
	container: HTMLElement,
	integrationId: string,
	sku: string
): void {
	const style = document.createElement('style');
	style.textContent = STYLES;
	document.head.appendChild(style);
	
	// Client sites are increasingly SPAs — re-render when the shopper navigates.
	window.addEventListener('popstate', () => {
		mountCompleteTheLook(container, integrationId, sku);
	});
	
	const endpoint =
	`https://recs.jewelml.io/v1/${integrationId}/complete-the-look?sku=${sku}`;

	const xhr = new XMLHttpRequest();
	xhr.open('GET', endpoint, false);
	xhr.send();

	const items: CatalogItem[] = JSON.parse(xhr.responseText).items;

	container.className = 'jml-ctl';
	container.innerHTML = items
		.map(
			(item) => `
				<a class="jml-ctl__item" href="${item.url}" data-sku="${item.sku}">
				<img src="${item.image.url}" alt="${item.image.alt}">
				<h3>${item.title}</h3>
				<p>${item.brand} — ${item.price.formatted}</p>
				</a>
				`,
			)
		.join('');

		console.log('[jewel] complete-the-look rendered', {
			integrationId,
			sku,
			itemCount: items.length,
			shopperId: getShopperId(),
			shopperEmail: getShopperEmail(),
		});
	}