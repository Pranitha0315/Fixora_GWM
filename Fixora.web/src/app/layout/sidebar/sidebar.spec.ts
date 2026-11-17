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

  it('should render all 10 navigation links', () => {
    const fixture = TestBed.createComponent(Sidebar);
    fixture.detectChanges();

    const element = fixture.nativeElement as HTMLElement;

    expect(
      element.querySelectorAll('.navigation-link').length
    ).toBe(10);
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
