import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { ThemeService } from './theme.service';

describe('ThemeService', () => {
  beforeEach(() => {
    localStorage.removeItem('fixora-manager-theme');
    document.documentElement.classList.remove('dark-theme');
    document.documentElement.style.colorScheme = '';
    TestBed.resetTestingModule();
  });

  afterEach(() => {
    TestBed.resetTestingModule();
    localStorage.removeItem('fixora-manager-theme');
    document.documentElement.classList.remove('dark-theme');
    document.documentElement.style.colorScheme = '';
  });

  it('defaults to light theme', () => {
    const service = TestBed.inject(ThemeService);

    expect(service.theme()).toBe('light');
    expect(service.isDarkMode()).toBe(false);
    expect(document.documentElement.classList.contains('dark-theme')).toBe(false);
  });

  it('applies dark theme and persists preference', () => {
    const service = TestBed.inject(ThemeService);

    service.setTheme('dark');

    expect(service.theme()).toBe('dark');
    expect(service.isDarkMode()).toBe(true);
    expect(document.documentElement.classList.contains('dark-theme')).toBe(true);
    expect(localStorage.getItem('fixora-manager-theme')).toBe('dark');
  });

  it('switches back to light theme', () => {
    const service = TestBed.inject(ThemeService);

    service.setTheme('dark');
    service.setTheme('light');

    expect(service.theme()).toBe('light');
    expect(service.isDarkMode()).toBe(false);
    expect(document.documentElement.classList.contains('dark-theme')).toBe(false);
    expect(localStorage.getItem('fixora-manager-theme')).toBe('light');
  });

  it('restores a saved dark theme', () => {
    localStorage.setItem('fixora-manager-theme', 'dark');

    const service = TestBed.inject(ThemeService);

    expect(service.theme()).toBe('dark');
    expect(service.isDarkMode()).toBe(true);
    expect(document.documentElement.classList.contains('dark-theme')).toBe(true);
  });

  it('ignores invalid saved theme values', () => {
    localStorage.setItem('fixora-manager-theme', 'invalid');

    const service = TestBed.inject(ThemeService);

    expect(service.theme()).toBe('light');
    expect(service.isDarkMode()).toBe(false);
  });
});