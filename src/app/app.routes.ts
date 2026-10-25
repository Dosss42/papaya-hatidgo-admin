import { Routes } from '@angular/router';
import { adminGuard, guestGuard } from './core/auth';

/** Every page but the login sits inside the Shell and needs an admin session. */
export const routes: Routes = [
  { path: 'login', canActivate: [guestGuard], title: 'Log in · Papaya HatidGo Admin', loadComponent: () => import('./pages/login').then((m) => m.LoginPage) },
  {
    path: '',
    canActivate: [adminGuard],
    loadComponent: () => import('./layout/shell').then((m) => m.Shell),
    children: [
      { path: '', title: 'Dashboard · Papaya HatidGo Admin', loadComponent: () => import('./pages/dashboard').then((m) => m.DashboardPage) },
      { path: 'verification', title: 'Verification · Papaya HatidGo Admin', loadComponent: () => import('./pages/verification').then((m) => m.VerificationPage) },
      { path: 'verification/:documentId', title: 'Review a document · Papaya HatidGo Admin', loadComponent: () => import('./pages/document-review').then((m) => m.DocumentReviewPage) },
      { path: 'rides', title: 'Rides · Papaya HatidGo Admin', loadComponent: () => import('./pages/rides').then((m) => m.RidesPage) },
      { path: 'users', title: 'Users · Papaya HatidGo Admin', loadComponent: () => import('./pages/users').then((m) => m.UsersPage) },
      { path: 'fares', title: 'Fares & settings · Papaya HatidGo Admin', loadComponent: () => import('./pages/fares').then((m) => m.FaresPage) },
      { path: 'plans', title: 'Plans & payments · Papaya HatidGo Admin', loadComponent: () => import('./pages/plans').then((m) => m.PlansPage) },
      { path: 'requirements', title: 'Requirements · Papaya HatidGo Admin', loadComponent: () => import('./pages/requirements').then((m) => m.RequirementsPage) },
      { path: 'reports', title: 'Reports · Papaya HatidGo Admin', loadComponent: () => import('./pages/reports').then((m) => m.ReportsPage) },
      { path: 'audit', title: 'Audit log · Papaya HatidGo Admin', loadComponent: () => import('./pages/audit').then((m) => m.AuditPage) },
    ],
  },
  { path: '**', redirectTo: '' },
];
