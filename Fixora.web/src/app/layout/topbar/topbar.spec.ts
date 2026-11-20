import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { Topbar } from './topbar';

describe('Topbar', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [Topbar],
      providers: [provideRouter([])],
    }).compileComponents();
  });

  it('should create the topbar', () => {
    const fixture = TestBed.createComponent(Topbar);
    expect(fixture.componentInstance).toBeTruthy();
  });

  it('should display the workspace title', () => {
    const fixture = TestBed.createComponent(Topbar);
    fixture.detectChanges();

    const element = fixture.nativeElement as HTMLElement;

    expect(element.querySelector('.workspace-title')?.textContent)
      .toContain('Workshop Management');
  });

  it('should provide notifications navigation', () => {
    const fixture = TestBed.createComponent(Topbar);
    fixture.detectChanges();

    const element = fixture.nativeElement as HTMLElement;

    expect(
      element.querySelector('a[href="/notifications"]')
    ).toBeTruthy();
  });

  it('should display the manager placeholder', () => {
    const fixture = TestBed.createComponent(Topbar);
    fixture.detectChanges();

    const element = fixture.nativeElement as HTMLElement;

    expect(element.querySelector('.account-name')?.textContent)
      .toContain('Manager');
  });
});
