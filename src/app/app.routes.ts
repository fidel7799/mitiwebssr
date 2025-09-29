import { Routes } from '@angular/router';
import { EcommerceComponent } from './ecommerce/ecommerce.component';

export const routes: Routes = [
	{ path: '', component: EcommerceComponent },
	{ path: '**', redirectTo: '' },
];
