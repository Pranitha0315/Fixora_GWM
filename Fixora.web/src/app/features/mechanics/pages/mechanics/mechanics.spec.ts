import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Mechanics } from './mechanics';

describe('Mechanics', () => {
  let component: Mechanics;
  let fixture: ComponentFixture<Mechanics>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [Mechanics],
    }).compileComponents();

    fixture = TestBed.createComponent(Mechanics);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
