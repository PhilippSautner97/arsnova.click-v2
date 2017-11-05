import {Component, EventEmitter, OnDestroy, OnInit} from '@angular/core';
import {FooterBarService} from '../../../service/footer-bar.service';
import {IQuestion} from '../../../../lib/questions/interfaces';
import {AttendeeService, INickname} from '../../../service/attendee.service';
import {IMessage} from '../quiz-lobby/quiz-lobby.component';
import {DefaultSettings} from '../../../../lib/default.settings';
import {HttpClient} from '@angular/common/http';
import {ConnectionService} from '../../../service/connection.service';
import {HeaderLabelService} from '../../../service/header-label.service';
import {Router} from '@angular/router';
import {CurrentQuizService} from '../../../service/current-quiz.service';
import {I18nService, NumberTypes} from '../../../service/i18n.service';
import {QuestionTextService} from '../../../service/question-text.service';
import {RangedQuestion} from '../../../../lib/questions/question_ranged';
import {FreeTextQuestion} from '../../../../lib/questions/question_freetext';
import {SurveyQuestion} from '../../../../lib/questions/question_survey';

export class Countdown {
  get isRunning(): boolean {
    return this._isRunning;
  }
  get remainingTime(): number {
    return this._remainingTime;
  }
  set remainingTime(value: number) {
    this._remainingTime = value;
  }

  private _isRunning: boolean;
  private _time: number;
  private _remainingTime: number;
  private _interval: any;

  public onChange = new EventEmitter<number>();

  constructor(question: IQuestion, startTimestamp: number) {
    this._time = question.timer;
    const endTimestamp = startTimestamp + this._time * 1000;
    this._remainingTime = Math.round((endTimestamp - new Date().getTime()) / 1000);
    if (this._remainingTime <= 0) {
      return;
    }
    this._isRunning = true;
    this._interval = setInterval(() => {
      this._remainingTime--;
      this.onChange.next(this._remainingTime);
      if (this._remainingTime <= 0) {
        this._isRunning = false;
        clearInterval(this._interval);
      }
    }, 1000);
  }

  public stop() {
    clearInterval(this._interval);
    this._remainingTime = 0;
    this._isRunning = false;
  }
}

@Component({
  selector: 'app-quiz-results',
  templateUrl: './quiz-results.component.html',
  styleUrls: ['./quiz-results.component.scss']
})
export class QuizResultsComponent implements OnInit, OnDestroy {
  get selectedQuestionIndex(): number {
    return this._selectedQuestionIndex;
  }
  private _selectedQuestionIndex: number;

  public countdown: Countdown;
  public answers: Array<string> = [];

  constructor(
    public currentQuizService: CurrentQuizService,
    private http: HttpClient,
    private router: Router,
    private headerLabelService: HeaderLabelService,
    private connectionService: ConnectionService,
    private footerBarService: FooterBarService,
    private i18nService: I18nService,
    private questionTextService: QuestionTextService,
    private attendeeService: AttendeeService) {

    headerLabelService.setHeaderLabel('component.liveResults.title');

    this._selectedQuestionIndex = currentQuizService.questionIndex;

    if (currentQuizService.isOwner) {
      this.connectionService.authorizeWebSocketAsOwner(this.currentQuizService.quiz.hashtag);
      let footerElems;
      if (this.currentQuizService.questionIndex === this.currentQuizService.quiz.questionList.length - 1) {
        footerElems = [
          this.footerBarService.footerElemBack,
          this.footerBarService.footerElemLeaderboard,
          this.footerBarService.footerElemFullscreen,
        ];
      } else {
        footerElems = [
          this.footerBarService.footerElemBack,
          this.footerBarService.footerElemReadingConfirmation,
          this.footerBarService.footerElemConfidenceSlider,
          this.footerBarService.footerElemResponseProgress,
          this.footerBarService.footerElemFullscreen,
          this.footerBarService.footerElemSound,
        ];
      }
      this.footerBarService.replaceFooterElements(footerElems);
      this.footerBarService.footerElemBack.onClickCallback = () => {
        this.http.patch(`${DefaultSettings.httpApiEndpoint}/quiz/reset/${this.currentQuizService.quiz.hashtag}`, {}).subscribe(
          (data: IMessage) => {
            this.currentQuizService.questionIndex = 0;
            this.router.navigate(['/quiz', 'flow', 'lobby']);
          }
        );
      };
    } else {
      this.footerBarService.replaceFooterElements([
      ]);
    }
  }

  showLeaderBoardButton(index: number): boolean {
    return !(this.currentQuizService.quiz.questionList[index] instanceof SurveyQuestion);
  }

  showStartQuizButton(): boolean {
    return this.currentQuizService.isOwner &&
           (!this.countdown || !this.countdown.isRunning) &&
           this.currentQuizService.questionIndex === this._selectedQuestionIndex &&
           (this.currentQuizService.questionIndex < this.currentQuizService.quiz.questionList.length - 1 ||
            this.currentQuizService.quiz.sessionConfig.readingConfirmationEnabled &&
            this.currentQuizService.readingConfirmationRequested);
  }

  showConfidenceRate(questionIndex: number): boolean {
    const matches = this.attendeeService.attendees.filter(value => {
      return value.responses[questionIndex] ? value.responses[questionIndex].confidence : false;
    });
    return matches.length > 0 || this.currentQuizService.quiz.sessionConfig.confidenceSliderEnabled;
  }

  modifyVisibleQuestion(index: number): void {
    this._selectedQuestionIndex = index;
    this.generateAnswers(this.currentQuizService.quiz.questionList[index]);
  }

  getConfidenceData(questionIndex: number): Object {
    const result = {
      base: this.attendeeService.attendees.length,
      absolute: 0,
      percent: '0'
    };
    if (questionIndex >= 0) {
      const matches = this.attendeeService.attendees.filter(value => {
        return value.responses[questionIndex] ? value.responses[questionIndex].confidence : false;
      });
      const absoluteValues = matches.length ? this.attendeeService.attendees.map(value => {
        return value.responses[questionIndex] ? value.responses[questionIndex].confidence : 0;
      }).reduce((currentValue, nextValue) => {
        return currentValue + nextValue;
      }) : 0;
      result.absolute = matches.length;
      result.percent = this.i18nService.formatNumber(absoluteValues / (matches.length || 1) / 100, NumberTypes.percent);
    }
    return result;
  }

  showReadingConfirmation(questionIndex: number): boolean {
    const matchCount = this.attendeeService.attendees.filter(value => {
      return value.responses[questionIndex] ? value.responses[questionIndex].readingConfirmation : false;
    }).length;
    return matchCount > 0 || this.currentQuizService.quiz.sessionConfig.readingConfirmationEnabled;
  }

  showResponseProgress(): boolean {
    return this.currentQuizService.quiz.sessionConfig.showResponseProgress;
  }

  getReadingConfirmationData(questionIndex: number): Object {
    const result = {
      base: this.attendeeService.attendees.length,
      absolute: 0,
      percent: '0'
    };
    if (questionIndex >= 0) {
      const matchCount = this.attendeeService.attendees.filter(value => {
        return value.responses[questionIndex] ? value.responses[questionIndex].readingConfirmation : false;
      }).length;
      result.absolute = matchCount;
      result.percent = this.i18nService.formatNumber(matchCount / (this.attendeeService.attendees.length || 1), NumberTypes.percent);
    }
    return result;
  }

  handleMessages() {
    if (!this.attendeeService.attendees.length) {
      this.connectionService.sendMessage({
        status: 'STATUS:SUCCESSFUL',
        step: 'LOBBY:GET_PLAYERS',
        payload: {quizName: this.currentQuizService.quiz.hashtag}
      });
    }
    this.connectionService.socket.subscribe((data: IMessage) => {
      switch (data.step) {
        case 'LOBBY:ALL_PLAYERS':
          data.payload.members.forEach((elem: INickname) => {
            this.attendeeService.addMember(elem);
          });
          break;
        case 'MEMBER:UPDATED_RESPONSE':
          console.log('modify response data for nickname in live results view', data.payload.nickname);
          this.attendeeService.modifyResponse(data.payload.nickname);
          if (this.attendeeService.attendees.filter(attendee => {
              return attendee.responses[this.currentQuizService.questionIndex] ?
                     attendee.responses[this.currentQuizService.questionIndex].value :
                     false;
          }).length === this.attendeeService.attendees.length && this.countdown) {
            this.countdown.remainingTime = 1;
          }
          break;
        case 'QUIZ:NEXT_QUESTION':
          this.currentQuizService.questionIndex = data.payload.questionIndex;
          this._selectedQuestionIndex = data.payload.questionIndex;
          break;
        case 'QUIZ:RESET':
          this.attendeeService.clearResponses();
          this.currentQuizService.questionIndex = 0;
          this.router.navigate(['/quiz', 'flow', 'lobby']);
          break;
        case 'LOBBY:CLOSED':
          this.router.navigate(['/']);
          break;
      }
      this.currentQuizService.isOwner ? this.handleMessagesForOwner(data) : this.handleMessagesForAttendee(data);
    });
  }

  private handleMessagesForOwner(data: IMessage) {
    switch (data.step) {
      default:
        return;
    }
  }

  private handleMessagesForAttendee(data: IMessage) {
    switch (data.step) {
      case 'QUIZ:START':
        this.router.navigate(['/quiz', 'flow', 'voting']);
        break;
      case 'QUIZ:READING_CONFIRMATION_REQUESTED':
        this.router.navigate(['/quiz', 'flow', 'reading-confirmation']);
        break;
    }
  }

  private startQuiz(): void {
    const target = this.currentQuizService.quiz.sessionConfig.readingConfirmationEnabled &&
                   !this.currentQuizService.readingConfirmationRequested ?
                   'reading-confirmation' : 'start';

    this.http.post(`${DefaultSettings.httpApiEndpoint}/quiz/${target}`, {
      quizName: this.currentQuizService.quiz.hashtag
    }).subscribe((data: IMessage) => {

      if (data.status === 'STATUS:SUCCESSFUL') {
        const question = this.currentQuizService.currentQuestion();
        this.generateAnswers(question);

        if (data.step === 'QUIZ:READING_CONFIRMATION_REQUESTED') {
          this.currentQuizService.readingConfirmationRequested = true;

        } else {
          this.currentQuizService.readingConfirmationRequested = false;
          this.countdown = new Countdown(question, data.payload.startTimestamp);
          if (this.currentQuizService.questionIndex === this.currentQuizService.quiz.questionList.length - 1) {
            this.footerBarService.replaceFooterElements([
              this.footerBarService.footerElemBack,
              this.footerBarService.footerElemLeaderboard,
              this.footerBarService.footerElemFullscreen,
            ]);
          }

        }
      }
    });
  }

  private generateAnswers(question: IQuestion): void {
    if (question instanceof RangedQuestion) {
      this.answers = ['guessed_correct', 'guessed_in_range', 'guessed_wrong'];

    } else if (question instanceof FreeTextQuestion) {
      this.answers = ['correct_answer', 'wrong_answer'];

    } else {
      this.questionTextService.changeMultiple(question.answerOptionList.map(answer => {
        return answer.answerText;
      }));
    }
  }

  ngOnInit() {
    this.handleMessages();
    this.questionTextService.getEmitter().subscribe((data: Array<string>) => {
      this.answers = data;
    });
    this.connectionService.initConnection().then(() => {
      const url = `${DefaultSettings.httpApiEndpoint}/quiz/currentState/${this.currentQuizService.quiz.hashtag}`;
      this.http.get(url).subscribe((data: IMessage) => {
        if (data.status === 'STATUS:SUCCESSFUL') {
          const question = this.currentQuizService.currentQuestion();
          this.countdown = new Countdown(question, data.payload.startTimestamp);

          this.generateAnswers(question);
        }
      });
      if (this.currentQuizService.isOwner) {
        this.connectionService.authorizeWebSocketAsOwner(this.currentQuizService.quiz.hashtag);
      } else {
        this.connectionService.authorizeWebSocket(this.currentQuizService.quiz.hashtag);
      }
      if (this.attendeeService.attendees.filter(attendee => {
          return attendee.responses[this.currentQuizService.questionIndex] ?
                 attendee.responses[this.currentQuizService.questionIndex].value :
                 false;
        }).length === this.attendeeService.attendees.length && this.countdown) {
        this.countdown.stop();
      }
    });
  }

  ngOnDestroy() {
    this.footerBarService.footerElemBack.restoreClickCallback();
  }

}
