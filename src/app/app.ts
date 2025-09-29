import { Component, signal } from '@angular/core';
import { EcommerceComponent } from './ecommerce/ecommerce.component';
import { VersionBannerComponent } from './version-banner.component';
import { ToastModule } from 'primeng/toast';
import { MessageService } from 'primeng/api';

@Component({
  selector: 'app-root',
  imports: [EcommerceComponent, VersionBannerComponent, ToastModule],
  providers: [MessageService],
  templateUrl: './app.html',
  styleUrl: './app.css'
})
export class App {
  protected readonly title = signal('mitiweb');
}
