import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { ManagerShell } from './manager-shell';

describe('ManagerShell', () => {
  let component: ManagerShell;
  let fixture: ComponentFixture<ManagerShell>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      providers: [provideRouter([])],
      imports: [ManagerShell],
    }).compileComponents();

    fixture = TestBed.createComponent(ManagerShell);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
