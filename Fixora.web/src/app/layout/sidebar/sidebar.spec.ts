import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { Sidebar } from './sidebar';

describe('Sidebar', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [Sidebar],
      providers: [provideRouter([])],
    }).compileComponents();
  });

  it('should create the sidebar', () => {
    const fixture = TestBed.createComponent(Sidebar);
    expect(fixture.componentInstance).toBeTruthy();
  });

  it('should render all 11 navigation links', () => {
    const fixture = TestBed.createComponent(Sidebar);
    fixture.detectChanges();

    const element = fixture.nativeElement as HTMLElement;

    expect(
      element.querySelectorAll('.navigation-link').length
    ).toBe(11);
  });

  it('should list Adaptive Queue directly after Job Cards', () => {
    const fixture = TestBed.createComponent(Sidebar);
    fixture.detectChanges();

    const element = fixture.nativeElement as HTMLElement;
    const hrefs = Array.from(
      element.querySelectorAll('.navigation-link'),
    ).map((link) => link.getAttribute('href'));

    expect(hrefs.indexOf('/adaptive-queue')).toBe(
      hrefs.indexOf('/job-cards') + 1,
    );
    expect(hrefs).toContain('/job-cards');
  });

  it('should label the Adaptive Queue link', () => {
    const fixture = TestBed.createComponent(Sidebar);
    fixture.detectChanges();

    const element = fixture.nativeElement as HTMLElement;
    const link = element.querySelector(
      'a[href="/adaptive-queue"] .navigation-label',
    );

    expect(link?.textContent?.trim()).toBe('Adaptive Queue');
  });

  it('should keep every navigation icon unique and sequential', () => {
    const fixture = TestBed.createComponent(Sidebar);
    fixture.detectChanges();

    const element = fixture.nativeElement as HTMLElement;
    const icons = Array.from(
      element.querySelectorAll('.navigation-icon'),
    ).map((icon) => icon.textContent?.trim());

    expect(icons).toEqual([
      '01', '02', '03', '04', '05', '06',
      '07', '08', '09', '10', '11',
    ]);
  });

  it('should include the dashboard navigation link', () => {
    const fixture = TestBed.createComponent(Sidebar);
    fixture.detectChanges();

    const element = fixture.nativeElement as HTMLElement;

    expect(
      element.querySelector('a[href="/dashboard"]')
    ).toBeTruthy();
  });
});
